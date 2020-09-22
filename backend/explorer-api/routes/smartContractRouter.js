var express = require('express');
var router = express.Router();
var bodyParser = require('body-parser');
var helper = require('../helper/utils');
var solc = require('solc')

var smartContractRouter = (app, smartContractDao) => {
  router.use(bodyParser.urlencoded({ extended: true }));

  // The api to verify the source and bytecode
  router.get("/smartContract/verify/:address", (req, res) => {
    let address = helper.normalize(req.params.address.toLowerCase());
    let { sourceCode, byteCode, abi, version, optimizer } = req.query;
    console.log(`optimizer: ${optimizer}, type: ${typeof optimizer}, value: ${optimizer === '1'}`)
    // console.log(`sourceCode: ${sourceCode}, abi: ${abi}, version: ${version}, address: ${address}, byteCode: ${byteCode}`)
    try {
      console.log('Verifing the source code and bytecode for address:', address);
      let start = +new Date();
      var input = {
        language: 'Solidity',
        settings: {
          optimizer: {
            enabled: optimizer === '1'
          },
          outputSelection: {
            '*': {
              '*': ['*']
            }
          }
        },
        sources: {
          'test.sol': {
            content: sourceCode
          }
        }
      };
      var output = '';
      solc.loadRemoteVersion(version, function (err, solcSnapshot) {
        const cur = +new Date();
        console.log(`load Remote version takes: ${(cur - start) / 1000} seconds`)
        if (err) {
          console.log('error in solc:', err)
          // An error was encountered, display and quit
        } else {
          start = +new Date();
          output = JSON.parse(solcSnapshot.compile(JSON.stringify(input)))
          console.log(`compile takes ${(+new Date() - start) / 1000} seconds`)
          console.log(`output:`, output)
        }
        let check = output.errors.reduce((check, err) => {
          if (err.severity === 'warning') {
            if (!check.warnings) check.warnings = [];
            check.warnings.push(err.message);
          }
          if (err.severity === 'error') {
            check.error = error.message;
          }
          return check;
        }, {});
        console.log(`check:`, check)
        let data = {}
        if (check.error) {
          data = { result: 'Not Verified', err_msg: check.error }
        } else {
          data = { result: 'Verified', warning_msg: check.warnings }
          // console.log(`output: `, output)
          for (var contractName in output.contracts['test.sol']) {
            const obj = output.contracts['test.sol'][contractName].evm.bytecode.object;
            console.log('obj', obj)
            // if (contractName === 'AdminUpgradeabilityProxy') {
            //   console.log(obj)
            // }
          }
        }
        res.status(200).send(data);
      });
      var output = JSON.parse(
        solc.compile(JSON.stringify(input))
      );

      // new one
      // var input = { 'test.sol': sourceCode }
      // var output = ''
      // var solcV = solc.useVersion(version);
      // console.log(`use Remote version takes: ${(+new Date() - start) / 1000} seconds`)
      // output = JSON.parse(solcV.compile(input, 1));
    } catch (e) {
      console.log('Error in catch:', e)
      res.status(400).send(e)
    }

  });
  // The api to get total amount of Theta
  router.get("/smartContract/:address", (req, res) => {
    let address = helper.normalize(req.params.address.toLowerCase());
    console.log('Querying smart contract data for address:', address);
    smartContractDao.getSmartContractByAddressAsync(address)
      .then(info => {
        const data = ({
          type: 'smart_contract',
          body: info,
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
          console.log('ERR - ', error)
        }
      });
  });



  //the / route of router will get mapped to /api
  app.use('/api', router);
}

module.exports = smartContractRouter;