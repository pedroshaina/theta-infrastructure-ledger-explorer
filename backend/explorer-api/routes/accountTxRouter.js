var express = require('express');
var router = express.Router();
var bodyParser = require('body-parser');
var helper = require('../helper/utils');

function orderTxs(txs, ids) {
  var hashOfResults = txs.reduce(function (prev, curr) {
    prev[curr._id] = curr;
    return prev;
  }, {});

  return ids.map(function (id) { return hashOfResults[id] });
}

var accountTxRouter = (app, accountDao, accountTxDao, accountTxSendDao, transactionDao, rpc) => {
  router.use(bodyParser.urlencoded({ extended: true }));
  // router.get("/accountTx/counter/:address", async (req, res) => {
  //   const address = helper.normalize(req.params.address.toLowerCase());
  //   let { type = 5, isEqualType = 'true', startTime = 0, endTime = 0 } = req.query;
  //   type = parseInt(type);
  //   accountTxDao.getInfoTotalAsync(address, type, isEqualType, startTime, endTime)
  //     .then(resp => {
  //       const data = ({
  //         total: resp
  //       });
  //       res.status(200).send(data);
  //     })
  // })

  router.get("/accountTx/tmp/:address", async (req, res) => {
    const address = helper.normalize(req.params.address.toLowerCase());
    let { type = 5, startTime = 0, endTime = 0 } = req.query;
    type = parseInt(type);
    accountTxDao.getInfoListByTimeAsync(address, startTime, endTime, type)
      .then(async infoList => {
        if (infoList && infoList.length < 2500) {
          let total = 0;
          for (let info of infoList) {
            const tmp = info._id.split('_');
            try {
              const tx = await transactionDao.getTransactionByPkAsync(tmp[1]);
              total += (tx.data.source.coins.tfuelwei - '0') / 1000000000000000000;
            } catch (e) {
              console.log('Error occurred while getting transaction in tmp:' + tmp[1]);
            }
          }
          var data = ({
            total: total
          });
          res.status(200).send(data);
        } else {
          const err = ({
            type: 'error_bad_request',
            error
          });
          res.status(400).send(err);
        }
      })
  })

  router.get("/accountTx/history/:address", async (req, res) => {
    const address = helper.normalize(req.params.address.toLowerCase());
    const type = 2;
    const isEqualType = 'true';

    accountDao.getAccountByPkAsync(address)
      .then(accountInfo => {
        totalNumber = accountInfo.txs_counter[type] ? accountInfo.txs_counter[type] : 0;
        let page = 0;
        return accountTxDao.getListAsync(address, type, isEqualType, page, totalNumber, false);
      })
      .then(async txList => {
        let txHashes = [];
        let txs = [];
        for (let acctTx of txList) {
          txHashes.push(acctTx.hash);
        }

        txs = await transactionDao.getTransactionsByPkAsync(txHashes);
        txs = orderTxs(txs, txHashes);
        let records = txs.map(tx => {
          const data = tx.data;
          let obj = {
            'tx_hash': tx.hash,
            'timestamp': `"${new Date(tx.timestamp * 1000).toUTCString()}"`
          }
          if (data.inputs[0].address === address) {
            obj.tx_type = 'Send';
            obj.theta_amount = helper.formatCoin(data.inputs[0].coins.thetawei);
            obj.tfuel_amount = helper.formatCoin(data.inputs[0].coins.tfuelwei);
            obj.from = address;
            let to = data.outputs.reduce((sum, output) => sum + output.address + ', ', '')
            obj.to = to.substring(0, to.length - 2)
          } else {
            data.outputs.forEach(output => {
              if (output.address === address) {
                obj.tx_type = 'Receive';
                obj.theta_amount = helper.formatCoin(output.coins.thetawei);
                obj.tfuel_amount = helper.formatCoin(output.coins.tfuelwei);
                obj.from = data.inputs[0].address;
                obj.to = address;
              }
            })
          }
          return obj;
        })
        var data = ({
          type: 'account_tx_list',
          body: records
        });
        res.status(200).send(data);
      })
      .catch(error => {
        const err = ({
          type: 'error_not_found',
          error
        });
        res.status(404).send(err);
      });
  });

  router.get("/accountTx/:address", async (req, res) => {
    const address = helper.normalize(req.params.address.toLowerCase());
    let { type = 2, isEqualType = 'true', pageNumber = 1, limitNumber = 10 } = req.query;
    type = parseInt(type);
    pageNumber = parseInt(pageNumber);
    limitNumber = parseInt(limitNumber);
    let totalNumber = 0;
    let numPages = 0;
    let reverse = false;

    if (!isNaN(pageNumber) && !isNaN(limitNumber) && pageNumber > 0 && limitNumber > 0 && limitNumber < 101) {
      accountDao.getAccountByPkAsync(address)
        .then(accountInfo => {
          if (isEqualType === 'true') {
            totalNumber = accountInfo.txs_counter[type] ? accountInfo.txs_counter[type] : 0;
          } else {
            if (accountInfo.txs_counter) {
              totalNumber = Object.keys(accountInfo.txs_counter).reduce((total, key) => {
                return key == type ? total : total + accountInfo.txs_counter[key]
              }, 0);
            }
          }
          numPages = Math.ceil(totalNumber / limitNumber);
          let page = pageNumber - 1;
          if (numPages > 200 && pageNumber > numPages / 2) {
            reverse = true;
            page = numPages - pageNumber;
          }

          return accountTxDao.getListAsync(address, type, isEqualType, page, limitNumber, reverse);
        })
        .then(async txList => {
          let txHashes = [];
          let txs = [];
          for (let acctTx of txList) {
            if (reverse) {
              txHashes.unshift(acctTx.hash);
            } else {
              txHashes.push(acctTx.hash);
            }
          }

          txs = await transactionDao.getTransactionsByPkAsync(txHashes);
          txs = orderTxs(txs, txHashes);

          var data = ({
            type: 'account_tx_list',
            body: txs,
            totalPageNumber: numPages,
            currentPageNumber: pageNumber
          });
          res.status(200).send(data);
        })
        .catch(error => {
          if (error.message.includes('NOT_FOUND')) {
            accountTxDao.getListAsync(address, type, isEqualType, pageNumber - 1, limitNumber, reverse)
              .then(async txList => {
                let txHashes = [];
                let txs = [];
                for (let acctTx of txList) {
                  if (reverse) {
                    txHashes.unshift(acctTx.hash);
                  } else {
                    txHashes.push(acctTx.hash);
                  }
                }

                txs = await transactionDao.getTransactionsByPkAsync(txHashes);
                txs = orderTxs(txs, txHashes);
                if (txs.length > 0) {
                  var data = ({
                    type: 'account_tx_list',
                    body: txs,
                    totalPageNumber: numPages,
                    currentPageNumber: pageNumber
                  });
                  res.status(200).send(data);
                } else {
                  const err = ({
                    type: 'error_not_found',
                  });
                  res.status(404).send(err);
                }
              }).catch(error => {
                const err = ({
                  type: 'error_not_found',
                  error
                });
                res.status(404).send(err);
              })
          } else {
            res.status(500).send(err);
          }
        });
    } else {
      res.status(400).send('Invalid parameter');
    }
  });

  router.get("/accountTx/latest/:address", async (req, res) => {
    const address = helper.normalize(req.params.address.toLowerCase());
    let { startTime = 0 } = req.query;
    const endTime = Math.ceil(Date.now() / 1000).toString();
    accountTxDao.getListByTimeAsync(address, startTime, endTime, null)
      .then(async txList => {
        let txHashes = [];
        let txs = [];
        for (let acctTx of txList) {
          txHashes.push(acctTx.hash);
        }

        txs = await transactionDao.getTransactionsByPkAsync(txHashes);
        txs = orderTxs(txs, txHashes);

        var data = ({
          type: 'account_tx_list',
          body: txs,
        });
        res.status(200).send(data);
      })
      .catch(error => {
        if (error.message.includes('NOT_FOUND')) {
          const err = ({
            type: 'error_not_found',
            error
          });
          res.status(404).send(err);
        } else {
          res.status(500).send(err);
        }
      });
  });


  router.get("/accountTxOld/:address", async (req, res) => {
    const address = helper.normalize(req.params.address.toLowerCase());
    let { type = 2, isEqualType = 'true', pageNumber = 1, limitNumber = 10 } = req.query;
    let totalNumber = 0;
    let diff = null;
    pageNumber = parseInt(pageNumber);
    limitNumber = parseInt(limitNumber);
    if (!isNaN(pageNumber) && !isNaN(limitNumber) && pageNumber > 0 && limitNumber > 0 && limitNumber < 101) {
      accountDao.getAccountByPkAsync(address)
        .then(accountInfo => {
          if (isEqualType === 'true') {
            totalNumber = accountInfo.txs_counter[type] ? accountInfo.txs_counter[type] : 0;
          } else {
            if (accountInfo.txs_counter) {
              totalNumber = Object.keys(accountInfo.txs_counter).reduce((total, key) => {
                return key === type ? total : total + accountInfo.txs_counter[key]
              }, 0);
            }
          }
          type = parseInt(type);
          if (totalNumber < pageNumber * limitNumber) {
            if (totalNumber > (pageNumber - 1) * limitNumber) {
              diff = totalNumber - (pageNumber - 1) * limitNumber;
              if ((isEqualType === 'true' && type === 2) || totalNumber === accountInfo.txs_counter[2]) {
                console.log('Search Tx Send DB only!');
                return accountTxSendDao.getInfoListAsync(address, pageNumber - 1, limitNumber, diff);
              } else {
                return accountTxDao.getInfoListByTypeAsync(address, type, isEqualType, pageNumber - 1, limitNumber, diff)
              }
            } else {
              const data = ({
                type: 'account_tx_list',
                body: [],
                totalPageNumber: Math.ceil(totalNumber / limitNumber),
                currentPageNumber: pageNumber
              });
              res.status(200).send(data);
            }
          } else {
            if ((isEqualType === 'true' && type === 2) || totalNumber === accountInfo.txs_counter[2]) {
              console.log('Search Tx Send DB only!');
              return accountTxSendDao.getInfoListAsync(address, pageNumber - 1, limitNumber, diff);
            } else {
              return accountTxDao.getInfoListByTypeAsync(address, type, isEqualType, pageNumber - 1, limitNumber, diff)
            }
          }
        })
        .then(async infoList => {
          if (infoList) {
            let result = [];
            for (let info of infoList) {
              const tmp = info._id.split('_');
              try {
                const tx = await transactionDao.getTransactionByPkAsync(tmp[1]);
                result.push(tx);
              } catch (e) {
                console.log('Error occurred while getting transaction:' + tmp[1]);
              }
            }
            // result = diff === null ? result : result.reverse();
            var data = ({
              type: 'account_tx_list',
              body: result,
              totalPageNumber: Math.ceil(totalNumber / limitNumber),
              currentPageNumber: pageNumber
            });
            res.status(200).send(data);
          }
        })
        .catch(error => {
          if (error.message.includes('NOT_FOUND')) {
            const err = ({
              type: 'error_not_found',
              error
            });
            res.status(404).send(err);
          } else {
            console.log('ERR - ', error)
          }
        });
    } else {
      res.status(400).send('Wrong parameter.');
    }
  });

  router.get("/accountTxOld/latest/:address", async (req, res) => {
    const address = helper.normalize(req.params.address.toLowerCase());
    let { startTime = 0 } = req.query;
    const endTime = Math.ceil(Date.now() / 1000).toString();
    accountTxDao.getInfoListByTimeAsync(address, startTime, endTime, null)
      .then(async infoList => {
        if (infoList) {
          let result = [];
          for (let info of infoList) {
            const tmp = info._id.split('_');
            try {
              const tx = await transactionDao.getTransactionByPkAsync(tmp[1]);
              result.push(tx);
            } catch (e) {
              console.log('Error occurred while getting transaction:' + tmp[1]);
            }
          }
          var data = ({
            type: 'account_tx_list',
            body: result,
          });
          res.status(200).send(data);
        } else {
          const err = ({
            type: 'error_bad_request',
            error
          });
          res.status(400).send(err);
        }
      })
      .catch(error => {
        if (error.message.includes('NOT_FOUND')) {
          const err = ({
            type: 'error_not_found',
            error
          });
          res.status(404).send(err);
        } else {
          console.log('ERR - ', error)
        }
      });
  });

  //the / route of router will get mapped to /api
  app.use('/api', router);
}
/**
 * @param {string[]} strs
 * @return {string[][]}
 */
var groupAnagrams = function (strs) {
  if (strs.length === 0) return [];
  var map = new Map();
  strs.forEach(s => {
    var c = s.split('').sort().join('');
    if (map.has(c)) {
      var v = map.get(c);
      v.push(s);
      map.set(c, v)
    } else {
      map.set(c, [s])
    }
  })
  return Array.from(map.values())
};
module.exports = accountTxRouter;