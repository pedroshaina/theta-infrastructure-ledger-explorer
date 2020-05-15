import React, { Component } from "react";
import { browserHistory, Link } from 'react-router';
import cx from 'classnames';

import { blocksService } from 'common/services/block';
import LinkButton from "common/components/link-button";
import NotExist from 'common/components/not-exist';
import { BlockStatus, TxnTypeText, TxnClasses } from 'common/constants';
import { date, hash, prevBlock } from 'common/helpers/blocks';
import { formatCoin, priceCoin } from 'common/helpers/utils';
import { priceService } from 'common/services/price';

export default class BlocksExplorer extends Component {
  constructor(props) {
    super(props);
    this.state = {
      backendAddress: this.props.route.backendAddress,
      block: null,
      totalBlocksNumber: undefined,
      errorType: null,
      price: {}
    };
  }
  componentWillUpdate(nextProps) {
    if (nextProps.params.blockHeight !== this.props.params.blockHeight) {
      this.getOneBlockByHeight(nextProps.params.blockHeight);
    }
  }
  componentDidMount() {
    const { blockHeight } = this.props.params;
    this.getOneBlockByHeight(blockHeight);
    this.getPrices();
  }
  getOneBlockByHeight(height) {
    const { totalBlocksNumber } = this.state;
    const msg = this.props.location.state;
    if (Number(height)
      && (totalBlocksNumber === undefined
        || totalBlocksNumber >= height
        || height > 0)) {
      blocksService.getBlockByHeight(height)
        .then(res => {
          switch (res.data.type) {
            case 'block':
              this.setState({
                block: res.data.body,
                totalBlocksNumber: res.data.totalBlocksNumber,
                errorType: null
              });
              break;
            case 'error_not_found':
              this.setState({
                errorType: msg ? 'error_coming_soon' : 'error_not_found'
              });
          }
        }).catch(err => {
          console.log(err);
        })
    } else {
      this.setState({
        errorType: 'error_not_found'
      });
      console.log('Wrong Height')
    }
  }
  renderNoMoreMsg() {
    return (
      <div className="th-explorer__buttons--no-more">No More</div>
    )
  }
  getPrices() {
    priceService.getAllprices()
      .then(res => {
        const prices = _.get(res, 'data.body');
        prices.forEach(info => {
          switch (info._id) {
            case 'THETA':
              this.setState({ price: { ...this.state.price, 'Theta': info.price } })
              return;
            case 'TFUEL':
              this.setState({ price: { ...this.state.price, 'TFuel': info.price } })
              return;
            default:
              return;
          }
        })
      })
      .catch(err => {
        console.log(err);
      });
    setTimeout(() => {
      let { price } = this.state;
      if (!price.Theta || !price.TFuel) {
        this.getPrices();
      }
    }, 1000);
  }
  render() {
    const { block, totalBlocksNumber, errorType, price } = this.state;
    const height = Number(this.props.params.blockHeight);
    const hasNext = totalBlocksNumber > height;
    const hasPrev = height > 1;
    const isCheckPoint = block && (block.total_voted_guardian_stakes != undefined);
    return (
      <div className="content block-details">
        <div className="page-title blocks">Block Details</div>
        {errorType === 'error_not_found' &&
          <NotExist />}
        {errorType === 'error_coming_soon' &&
          <NotExist msg="This block information is coming soon." />}
        {block && !errorType &&
          <React.Fragment>
            <table className="txn-info details">
              <tbody className={cx({ 'cp': isCheckPoint })}>
                <tr>
                  <th>Height</th>
                  <td>{height}</td>
                </tr>
                <tr>
                  <th>Status</th>
                  <td>{BlockStatus[block.status]}</td>
                </tr>
                <tr>
                  <th>Timestamp</th>
                  <td>{date(block)}</td>
                </tr>
                <tr>
                  <th>Hash</th>
                  <td>{hash(block)}</td>
                </tr>
                <tr>
                  <th># Transactions</th>
                  <td>{block.num_txs}</td>
                </tr>
                {isCheckPoint && <tr>
                  <th className="cp"># Voted Guardian Stakes</th>
                  <td>{block.total_voted_guardian_stakes}</td>
                </tr>}
                {isCheckPoint && <tr>
                  <th className="cp"># Deposited Guardian Stakes</th>
                  <td>
                    <div className="currency thetawei left">{formatCoin(block.total_deposited_guardian_stakes)} Theta</div>
                    <div className='price'>&nbsp;{`[\$${priceCoin(block.total_deposited_guardian_stakes, price['Theta'])} USD]`}</div>
                  </td>
                </tr>}
                <tr>
                  <th>Proposer</th>
                  <td>{<Link to={`/account/${block.proposer}`}>{block.proposer}</Link>}</td>
                </tr>
                <tr>
                  <th>State Hash</th>
                  <td>{block.state_hash}</td>
                </tr>
                <tr>
                  <th>Txns Hash</th>
                  <td>{block.transactions_hash}</td>
                </tr>
                <tr>
                  <th>Previous Block</th>
                  <td>{<Link to={`/blocks/${height - 1}`}>{prevBlock(block)}</Link>}</td>
                </tr>
              </tbody>
            </table>

            <h3>Transactions</h3>
            <table className="data transactions">
              <tbody>
                {_.map(block.txs, (t, i) => <Transaction key={i} txn={t} />)}
              </tbody>
            </table>

            <div className="button-list split">
              {hasPrev &&
                <Link className="btn icon prev" to={`/blocks/${height - 1}`}><i /></Link>}
              {hasNext &&
                <Link className="btn icon next" to={`/blocks/${height + 1}`}><i /></Link>}
            </div>
          </React.Fragment>}
      </div>);
  }
}

const Transaction = ({ txn }) => {
  let { hash, type } = txn;
  return (
    <tr className="block-txn">
      <td className={cx("txn-type", TxnClasses[type])}>{TxnTypeText[type]}</td>
      <td className="hash overflow"><Link to={`/txs/${hash}`}>{hash}</Link></td>
    </tr>)
}



