import * as chai from 'chai';
import { expect } from 'chai';
import * as chaiAsPromised from 'chai-as-promised';
import { Container } from 'inversify';
import * as sinon from 'sinon';
import { IBlocksModuleProcess } from '../../../../src/ioc/interfaces/modules';
import { Symbols } from '../../../../src/ioc/symbols';
import { BlocksModuleProcess } from '../../../../src/modules/blocks/';
import {
  BlocksSubmoduleChainStub,
  BlocksSubmoduleUtilsStub,
  BlocksSubmoduleVerifyStub,
  DelegatesModuleStub,
  PeersLogicStub, TransactionsModuleStub
} from '../../../stubs';
import { createContainer } from '../../../utils/containerCreator';
import TransportModuleStub from '../../../stubs/modules/TransportModuleStub';
import { AppStateStub } from '../../../stubs/logic/AppStateStub';
import ZSchemaStub from '../../../stubs/helpers/ZSchemaStub';
import DbStub from '../../../stubs/helpers/DbStub';
import { SequenceStub } from '../../../stubs/helpers/SequenceStub';
import BlocksModuleStub from '../../../stubs/modules/BlocksModuleStub';
import { SignedAndChainedBlockType } from '../../../../src/logic';
import { createFakePeer } from '../../../utils/fakePeersFactory';
import RoundsLogicStub from '../../../stubs/logic/RoundsLogicStub';
import { ForkModuleStub } from '../../../stubs/modules/ForkModuleStub';
import { BlockLogicStub } from '../../../stubs/logic/BlockLogicStub';
import { ForkType } from '../../../../src/helpers';
import AccountsModuleStub from '../../../stubs/modules/AccountsModuleStub';
import { IBaseTransaction } from '../../../../src/logic/transactions';
import { createRandomTransactions } from '../../../utils/txCrafter';
import TransactionLogicStub from '../../../stubs/logic/TransactionLogicStub';
import LoggerStub from '../../../stubs/helpers/LoggerStub';

chai.use(chaiAsPromised);

// tslint:disable no-unused-expression
describe('modules/blocks/process', () => {
  let inst: IBlocksModuleProcess;
  let instR: BlocksModuleProcess;
  let container: Container;
  const sandbox = sinon.sandbox.create();
  beforeEach(() => {
    container = createContainer();
    container.rebind(Symbols.modules.blocksSubModules.process).to(BlocksModuleProcess);

    inst = instR = container.get(Symbols.modules.blocksSubModules.process);
  });
  afterEach(() => {
    sandbox.restore();
  });

  let accountsModule: AccountsModuleStub;
  // let blocksModule: BlocksModuleStub;
  let appState: AppStateStub;
  let blockLogic: BlockLogicStub;
  let blocksChain: BlocksSubmoduleChainStub;
  let blockVerify: BlocksSubmoduleVerifyStub;
  let blocksModule: BlocksModuleStub;
  let blocksUtils: BlocksSubmoduleUtilsStub;
  let delegates: DelegatesModuleStub;
  let fork: ForkModuleStub;
  let txModule: TransactionsModuleStub;
  let dbSequence: SequenceStub;
  let dbStub: DbStub;
  let schemaStub: ZSchemaStub;
  let transportModule: TransportModuleStub;
  let peersLogic: PeersLogicStub;
  let roundsStub: RoundsLogicStub;
  let txLogic: TransactionLogicStub;
  let loggerStub: LoggerStub;
  // let blockLogic: BlockLogicStub;
  // let roundsModule: RoundsModuleStub;
  // let busStub: BusStub;
  beforeEach(() => {
    accountsModule = container.get(Symbols.modules.accounts);
    appState       = container.get(Symbols.logic.appState);
    blockLogic     = container.get(Symbols.logic.block);
    // accountsModule = container.get(Symbols.modules.accounts);
    blocksModule   = container.get(Symbols.modules.blocks);
    blocksUtils    = container.get(Symbols.modules.blocksSubModules.utils);
    blockVerify    = container.get(Symbols.modules.blocksSubModules.verify);
    blocksChain    = container.get(Symbols.modules.blocksSubModules.chain);
    delegates      = container.get(Symbols.modules.delegates);
    fork           = container.get(Symbols.modules.fork);
    // roundsModule   = container.get(Symbols.modules.rounds);
    // txModule       = container.get(Symbols.modules.transactions);
    // txLogic        = container.get(Symbols.logic.transaction);
    // blockLogic     = container.get(Symbols.logic.block);
    roundsStub      = container.get(Symbols.logic.rounds);
    transportModule = container.get(Symbols.modules.transport);
    dbStub          = container.get(Symbols.generic.db);
    dbSequence      = container.getTagged(
      Symbols.helpers.sequence,
      Symbols.helpers.sequence,
      Symbols.tags.helpers.dbSequence
    );
    // busStub = container.get(Symbols.helpers.bus);
    schemaStub      = container.get(Symbols.generic.zschema);
    peersLogic      = container.get(Symbols.logic.peers);
    txModule        = container.get(Symbols.modules.transactions);
    txLogic         = container.get(Symbols.logic.transaction);
    loggerStub      = container.get(Symbols.helpers.logger);
  });

  describe('getCommonBlock', () => {
    beforeEach(() => {
      blocksUtils.enqueueResponse('getIdSequence', {ids: ['1', '2', '3', '4', '5']});
    });
    it('should get idSequence first', async () => {
      try {
        await inst.getCommonBlock(null, 10);
      } catch (e) {
      }
      expect(blocksUtils.stubs.getIdSequence.called).is.true;
      expect(blocksUtils.stubs.getIdSequence.firstCall.args[0]).is.eq(10);
    });
    it('should call transportModule getFromPeer with proper data', async () => {
      transportModule.enqueueResponse('getFromPeer', Promise.resolve());
      try {
        await inst.getCommonBlock({peer: 'peer'} as any, 10);
      } catch (e) {
      }
      expect(transportModule.stubs.getFromPeer.called).is.true;
      expect(transportModule.stubs.getFromPeer.firstCall.args[0]).to.be.deep.eq({peer: 'peer'});
      expect(transportModule.stubs.getFromPeer.firstCall.args[1]).to.be.deep.eq({
        api   : '/blocks/common?ids=1,2,3,4,5',
        method: 'GET',
      });
    });
    describe('no match with peer (null common)', () => {
      beforeEach(() => {
        transportModule.enqueueResponse('getFromPeer', Promise.resolve({body: {common: null}}));
      });
      it('should check consensus', async () => {
        appState.stubs.getComputed.returns(true);
        blocksChain.enqueueResponse('recoverChain', Promise.resolve());
        await inst.getCommonBlock({peer: 'peer'} as any, 10);

        expect(appState.stubs.getComputed.called).is.true;
        expect(appState.stubs.getComputed.firstCall.args[0]).is.eq('node.poorConsensus');
      });
      it('should call recoverChain if consensus is low', async () => {
        appState.stubs.getComputed.returns(true);
        blocksChain.enqueueResponse('recoverChain', Promise.resolve());
        await inst.getCommonBlock({peer: 'peer'} as any, 10);

        expect(blocksChain.stubs.recoverChain.calledOnce).is.true;
      });
      it('should throw error if consensus is adeguate', async () => {
        appState.stubs.getComputed.returns(false);
        await expect(inst.getCommonBlock({peer: 'peer'} as any, 10)).to
          .be.rejectedWith('Chain comparison failed');
      });
    });
    it('should fail if peer response is not valid', async () => {
      transportModule.enqueueResponse('getFromPeer', Promise.resolve({body: {common: '1'}}));
      schemaStub.enqueueResponse('validate', false);
      schemaStub.enqueueResponse('getLastErrors', []);

      await expect(inst.getCommonBlock({peer: 'peer'} as any, 10))
        .to.be.rejectedWith('Cannot validate commonblock response');
    });
    it('should check response against db to avoid malicious peers', async () => {
      transportModule.enqueueResponse('getFromPeer', Promise.resolve({
        body: {
          common: {
            height       : 1,
            id           : 'id',
            previousBlock: 'pb',
          },
        }
      }));
      dbStub.enqueueResponse('query', Promise.resolve([{count: 1}]));
      await inst.getCommonBlock({p: 'p'} as any, 10);
      expect(dbStub.stubs.query.calledOnce).is.true;
      expect(dbStub.stubs.query.firstCall.args[0]).is
        .eq('SELECT COUNT("id")::int FROM blocks WHERE "id" = ${id} AND "previousBlock" = ${previousBlock} AND "height" = ${height}');
      expect(dbStub.stubs.query.firstCall.args[1]).is.deep.eq({
        height       : 1,
        id           : 'id',
        previousBlock: 'pb',
      });
    });
    it('should trigger recoverChain if returned commonblock does not return anything from db and poor consensus', async () => {
      transportModule.enqueueResponse('getFromPeer', Promise.resolve({
        body: {
          common: {},
        },
      }));
      dbStub.enqueueResponse('query', Promise.resolve([]));
      appState.enqueueResponse('getComputed', true); // poor consensus
      blocksChain.enqueueResponse('recoverChain', Promise.resolve());

      await inst.getCommonBlock({p: 'p'} as any, 10);
      expect(blocksChain.stubs.recoverChain.calledOnce).is.true;
      expect(appState.stubs.getComputed.calledOnce).is.true;
      expect(appState.stubs.getComputed.firstCall.args[0]).is.eq('node.poorConsensus');

    });
    it('should throw error if returned commonblock does not return anything from db and NOT poor consensus', async () => {
      transportModule.enqueueResponse('getFromPeer', Promise.resolve({
        body: {
          common: {},
        },
      }));
      dbStub.enqueueResponse('query', Promise.resolve([]));
      appState.enqueueResponse('getComputed', false); // poor consensus

      await expect(inst.getCommonBlock({p: 'p'} as any, 10)).to.be.rejectedWith('Chain comparison failed with peer');
    });
  });

  describe('loadBlocksOffset', () => {
    describe('db query', () => {
      it('should be done accounting offset>0', async () => {
        dbStub.enqueueResponse('query', Promise.resolve([]));
        blocksUtils.enqueueResponse('readDbRows', []);
        await inst.loadBlocksOffset(10, 5, true);

        expect(dbStub.stubs.query.firstCall.args[1]).to.be.deep.eq({
          limit : 10 /* limit */ + 5,
          offset: 5,
        });
      });
      it('should be done accounting offset=0', async () => {
        dbStub.enqueueResponse('query', Promise.resolve([]));
        blocksUtils.enqueueResponse('readDbRows', []);
        await inst.loadBlocksOffset(10, 0, true);

        expect(dbStub.stubs.query.firstCall.args[1]).to.be.deep.eq({
          limit : 10 /* limit */ + 0,
          offset: 0,
        });
      });
      it('should be done accounting offset=undefined', async () => {
        dbStub.enqueueResponse('query', Promise.resolve([]));
        blocksUtils.enqueueResponse('readDbRows', []);
        await inst.loadBlocksOffset(10, undefined, true);

        expect(dbStub.stubs.query.firstCall.args[1]).to.be.deep.eq({
          limit : 10 /* limit */ + 0,
          offset: 0,
        });
      });
    });

    it('should parse db rows using blocksUtilsModule', async () => {
      dbStub.enqueueResponse('query', Promise.resolve(['a' /*dummy*/]));
      blocksUtils.enqueueResponse('readDbRows', []);
      await inst.loadBlocksOffset(10, 0, true);

      expect(blocksUtils.stubs.readDbRows.calledOnce).is.true;
      expect(blocksUtils.stubs.readDbRows.firstCall.args[0]).is.deep.eq(['a']);
    });

    describe('with blocks', () => {
      beforeEach(() => {
        dbStub.enqueueResponse('query', Promise.resolve([]));
        blocksUtils.enqueueResponse('readDbRows', [{id: '1'}, {id: '2'}]);
        blocksChain.enqueueResponse('applyBlock', Promise.resolve());
        blocksChain.enqueueResponse('applyBlock', Promise.resolve());
      });
      it('if verify=true it should call blockVerifyModule on each block', async () => {
        // 2 blocks
        blockVerify.enqueueResponse('verifyBlock', Promise.resolve({verified: true}));
        blockVerify.enqueueResponse('verifyBlock', Promise.resolve({verified: true}));
        await inst.loadBlocksOffset(10, 0, true);
        expect(blockVerify.stubs.verifyBlock.callCount).eq(2);
      });
      it('if verify=true it should call blockVerify and stop processing if one is not verified', async () => {
        blockVerify.enqueueResponse('verifyBlock', Promise.resolve({verified: false, errors: ['ERROR']}));
        await expect(inst.loadBlocksOffset(10, 0, true)).to.be.rejectedWith('ERROR');
        expect(blockVerify.stubs.verifyBlock.calledOnce).is.true;
      });
      it('should call applyGenesisBlock if blockid is same as genesis', async () => {
        const genesis: SignedAndChainedBlockType = container.get(Symbols.generic.genesisBlock);
        blocksUtils.reset();
        blocksUtils.enqueueResponse('readDbRows', [genesis]);
        blocksChain.enqueueResponse('applyGenesisBlock', Promise.resolve());
        await inst.loadBlocksOffset(10, 0, false);
        expect(blocksChain.stubs.applyGenesisBlock.calledOnce).is.true;
      });
      it('should call applyBlock twice', async () => {
        await inst.loadBlocksOffset(10, 0, false);
        expect(blocksChain.stubs.applyBlock.callCount).is.eq(2);
      });
      it('should set lastBlock in blocksModule', async () => {
        await inst.loadBlocksOffset(10, 0, false);
        expect(blocksModule.lastBlock).to.be.deep.eq({id: '2'});
      });
      it('should return lastBlock', async () => {
        expect(await inst.loadBlocksOffset(10, 0, false)).to.be.deep.eq({id: '2'});
      });
      it('should set lastBlock to last successfully processed even if one fails', async () => {
        blocksChain.stubs.applyBlock.onCall(1).rejects();
        try {
          await inst.loadBlocksOffset(10, 0, false);
        } catch (e) {

        }
        expect(blocksModule.lastBlock).to.be.deep.eq({id: '1'});
      });
      it('should return undefined if cleanup', async() => {
        await inst.cleanup();
        expect(await inst.loadBlocksOffset(10, 0, false)).to.be.undefined;
      });
    });
  });

  describe('loadBlocksFromPeer', () => {
    let fakePeer;
    beforeEach(() => {
      fakePeer = createFakePeer();
      peersLogic.enqueueResponse('create', fakePeer);

    });
    it('should transport.getFromPeer with correct api and method', async () => {
      transportModule.enqueueResponse('getFromPeer', Promise.resolve({body: {}}));
      blocksUtils.enqueueResponse('readDbRows', []);
      blocksModule.lastBlock = {id: '1'} as any;
      await inst.loadBlocksFromPeer(null);
      expect(transportModule.stubs.getFromPeer.calledOnce).is.true;
      expect(transportModule.stubs.getFromPeer.firstCall.args[0]).is.deep.eq(fakePeer);
      expect(transportModule.stubs.getFromPeer.firstCall.args[1]).is.deep.eq({
        api   : '/blocks?lastBlockId=1',
        method: 'GET',
      });
    });
    it('should validate response against schema', async () => {
      transportModule.enqueueResponse('getFromPeer', Promise.resolve({body: {blocks: ['1', '2', '3']}}));
      blocksUtils.enqueueResponse('readDbRows', []);
      blocksModule.lastBlock = {id: '1'} as any;
      schemaStub.enqueueResponse('validate', false);

      await expect(inst.loadBlocksFromPeer(null))
        .to.rejectedWith('Received invalid blocks data');

      expect(schemaStub.stubs.validate.calledOnce).is.true;
      expect(schemaStub.stubs.validate.firstCall.args[0]).is.deep.eq(['1', '2', '3']);
    });
    it('should read returned data through utilsModule', async () => {
      transportModule.enqueueResponse('getFromPeer', Promise.resolve({body: {blocks: ['1', '2', '3']}}));
      blocksUtils.enqueueResponse('readDbRows', []);
      blockVerify.stubs.processBlock.resolves();
      blocksModule.lastBlock = {id: '1'} as any;

      await inst.loadBlocksFromPeer(null);

      expect(blocksUtils.stubs.readDbRows.calledOnce).is.true;
      expect(blocksUtils.stubs.readDbRows.firstCall.args[0]).is.deep.eq(['1', '2', '3']);
    });
    it('should call processBlock on each block', async () => {
      transportModule.enqueueResponse('getFromPeer', Promise.resolve({body: {blocks: []}}));
      blocksUtils.enqueueResponse('readDbRows', ['1', '2', '3']);
      blockVerify.stubs.processBlock.resolves();
      blocksModule.lastBlock = {id: '1'} as any;

      await inst.loadBlocksFromPeer(null);
      expect(blockVerify.stubs.processBlock.callCount).is.eq(3);
      expect(blockVerify.stubs.processBlock.getCall(0).args[0]).to.be.deep.eq('1');
      expect(blockVerify.stubs.processBlock.getCall(1).args[0]).to.be.deep.eq('2');
      expect(blockVerify.stubs.processBlock.getCall(2).args[0]).to.be.deep.eq('3');
      expect(blockVerify.stubs.processBlock.getCall(0).args[1]).to.be.deep.eq(false);
      expect(blockVerify.stubs.processBlock.getCall(0).args[2]).to.be.deep.eq(true);
    });
    it('should throw if one processBlock fails', async () => {
      transportModule.enqueueResponse('getFromPeer', Promise.resolve({body: {blocks: []}}));
      blocksUtils.enqueueResponse('readDbRows', ['1', '2', '3']);
      blockVerify.stubs.processBlock.resolves();
      blockVerify.stubs.processBlock.onCall(2).rejects();
      blocksModule.lastBlock = {id: '1'} as any;

      await expect(inst.loadBlocksFromPeer(null)).to.be.rejected;
      expect(blockVerify.stubs.processBlock.callCount).is.eq(3);

    });
    it('should return the last validBlock', async () => {
      transportModule.enqueueResponse('getFromPeer', Promise.resolve({body: {blocks: []}}));
      blocksUtils.enqueueResponse('readDbRows', ['1', '2', '3']);
      blockVerify.stubs.processBlock.resolves();
      blocksModule.lastBlock = {id: '1'} as any;

      expect(await inst.loadBlocksFromPeer(null)).to.be.eq('3');
    });
    it('should not process anything if is cleaning', async () => {
      transportModule.enqueueResponse('getFromPeer', Promise.resolve({body: {blocks: []}}));
      blocksUtils.enqueueResponse('readDbRows', ['1', '2', '3']);
      blockVerify.stubs.processBlock.resolves();
      blocksModule.lastBlock  = {id: '1'} as any;
      await inst.cleanup();

      expect(await inst.loadBlocksFromPeer(null)).to.be.deep.eq({id: '1'});
      expect(blockVerify.stubs.processBlock.called).is.false;
    });

  });

  describe('generateBlock', () => {
    let txs: Array<IBaseTransaction<any>>;
    beforeEach(() => {
      blocksModule.lastBlock = {id: '1', height: 10} as any;
      txs                    = createRandomTransactions({send: 3, vote: 2});
      accountsModule.stubs.getAccount.resolves({account: 'account'});
      txModule.stubs.getUnconfirmedTransactionList.callsFake(() => txs);
      blockLogic.enqueueResponse('create', {block: 'block'});
      txLogic.stubs.ready.returns(true);
      txLogic.stubs.verify.resolves();
      blockVerify.enqueueResponse('processBlock', Promise.resolve());
    });
    it('should get unconfirmed transactions list', async () => {
      await inst.generateBlock(null, 1);
      expect(txModule.stubs.getUnconfirmedTransactionList.called).is.true;
    });
    it('should throw if one account does not exist', async () => {
      accountsModule.stubs.getAccount.onCall(2).rejects(new Error('meow'));
      await expect(inst.generateBlock(null, 1)).to.be.rejectedWith('meow');
      expect(blockLogic.stubs.create.called).is.false;
    });
    it('should throw if account by publicKey not found', async () => {
      accountsModule.stubs.getAccount.onCall(0).resolves(Promise.resolve());
      await expect(inst.generateBlock(null, 1)).to.be.rejectedWith('Sender not found');
      expect(blockLogic.stubs.create.called).is.false;
    });
    it('should not verify every tx that is ready', async () => {
      txLogic.stubs.ready.onSecondCall().returns(false);
      await inst.generateBlock(null, 1)
      expect(txLogic.stubs.ready.callCount).to.be.eq(txs.length);
      expect(txLogic.stubs.verify.callCount).to.be.eq(txs.length - 1);
      txs.splice(1, 1); // remove unverified call;
      for (let i = 0; i < txs.length; i++) {
        expect(txLogic.stubs.verify.getCall(i).args).to.be.deep.eq([
          txs[i],
          {account: 'account'},
          null,
          10,
        ]);
      }
    });
    it('should call blockLogic.create with all ready(and verified) transactions', async () => {
      await inst.generateBlock({key: 'pair'} as any, 1);
      expect(blockLogic.stubs.create.calledOnce).is.true;
      expect(blockLogic.stubs.create.firstCall.args[0]).is.deep.eq({
        keypair      : {key: 'pair'},
        previousBlock: blocksModule.lastBlock,
        timestamp    : 1,
        transactions : txs,
      });
    });
    it('should call verify.processBlock with the generated block with broadcast=true and saveBlock=true', async () => {
      await inst.generateBlock({key: 'pair'} as any, 1);
      expect(blockVerify.stubs.processBlock.calledOnce).is.true;
      expect(blockVerify.stubs.processBlock.firstCall.args).to.be.deep.eq([
        {block: 'block'},
        true,
        true,
      ]);
    });
    it('should call logger.error if transactionLogic.verify throw', async() => {
      const error = new Error('hihihi');
      txLogic.stubs.verify.onCall(1).rejects(error);
      await inst.generateBlock({key: 'pair'} as any, 1);
      expect(loggerStub.stubs.error.calledOnce).is.true;
      expect(loggerStub.stubs.error.firstCall.args[0]).is.equal(error.stack);
    });
  });

  describe('onReceiveBlock', () => {
    it('should return and do nothing if loader.isSyncing', async () => {
      appState.stubs.get.callsFake((what) => {
        if (what === 'loader.isSyncing') {
          return true;
        }
        return false;
      });
      await inst.onReceiveBlock({id: '1'} as any);
      expect(appState.stubs.get.calledWith('loader.isSyncing')).is.true;
    });
    it('should return and do nothing if loader.isTicking', async () => {
      appState.stubs.get.callsFake((what) => {
        if (what === 'rounds.isTicking') {
          return true;
        }
        return false;
      });
      await inst.onReceiveBlock({id: '1'} as any);
      expect(appState.stubs.get.calledWith('rounds.isTicking')).is.true;
    });
    describe('all ok', () => {
      const block = {previousBlock: '1', height: 11} as any;
      beforeEach(() => {
        blocksModule.lastBlock = {id: '1', height: 10} as any;
        appState.stubs.get.returns(false);
        roundsStub.stubs.calcRound.returns('');
        blockVerify.enqueueResponse('processBlock', Promise.resolve());
      });
      it('should update lastReceipt', async () => {
        await inst.onReceiveBlock(block);
        expect(blocksModule.spies.lastReceipt.update.called).is.true;
      });
      it('should verify.processBlock with broadcast=true and saveBlock=true', async () => {
        await inst.onReceiveBlock(block);
        expect(blockVerify.stubs.processBlock.called).is.true;
        expect(blockVerify.stubs.processBlock.firstCall.args[0]).is.deep.eq(block);
        expect(blockVerify.stubs.processBlock.firstCall.args[1]).is.deep.eq(true);
        expect(blockVerify.stubs.processBlock.firstCall.args[2]).is.deep.eq(true);

      });
    });
    describe('fork 1 if consequent blocks but diff prevblock', () => {
      let block: any;
      beforeEach(() => {
        block                  = {previousBlock: '3', height: 11, timestamp: 2} as any;
        blocksModule.lastBlock = {id: '1', height: 10, timestamp: 1} as any;
        fork.enqueueResponse('fork', Promise.resolve());
        appState.stubs.get.returns(false);
        blockLogic.enqueueResponse('objectNormalize', {after: 'normalization'});
        delegates.enqueueResponse('assertValidBlockSlot', Promise.resolve());
        blockVerify.enqueueResponse('verifyReceipt', {verified: true});
        blocksChain.enqueueResponse('deleteLastBlock', Promise.resolve());
        blocksChain.enqueueResponse('deleteLastBlock', Promise.resolve());
      });
      it('should call forkModule.fork with ForkType.TYPE_1', async () => {
        await inst.onReceiveBlock(block);
        expect(fork.stubs.fork.calledOnce).is.true;
      });
      it('should go through verification if timestamp is < than last known', async () => {
        block.timestamp                  = 1;
        blocksModule.lastBlock.timestamp = 2;
        await inst.onReceiveBlock(block);
        expect(blockVerify.stubs.verifyReceipt.called).is.true;
        // should be called with normalization output
        expect(blockVerify.stubs.verifyReceipt.firstCall.args[0]).is.deep.eq({after: 'normalization'});
      });
      it('should go through verification if timestamp == last known but blockid < last known', async () => {
        block.timestamp                  = 1;
        blocksModule.lastBlock.timestamp = 1;
        block.id                         = '1';
        blocksModule.lastBlock.id        = '2';
        await inst.onReceiveBlock(block);
        expect(blockVerify.stubs.verifyReceipt.called).is.true;
      });
      it('should not delete lastBlock if verifyReceipt fails', async () => {
        block.timestamp                  = 1;
        blocksModule.lastBlock.timestamp = 2;
        blockVerify.stubs.verifyReceipt.returns({verified: false, errors: ['ERROR']});
        try {
          await inst.onReceiveBlock(block);
        } catch (e) {
          expect(e.message).to.be.eq('ERROR');
        }
        expect(blocksChain.stubs.deleteLastBlock.called).is.false;

      });
      it('should call deleteLastBlock twice if verification goes through', async () => {
        block.timestamp                  = 1;
        blocksModule.lastBlock.timestamp = 2;
        await inst.onReceiveBlock(block);
        expect(blocksChain.stubs.deleteLastBlock.callCount).is.eq(2);
      });
    });

    describe('fork 5 if same prevblock and height but different blockid', () => {
      let block: any;
      beforeEach(() => {
        block                  = {id: '2', previousBlock: '3', height: 11, timestamp: 1} as any;
        blocksModule.lastBlock = {id: '1', previousBlock: '3', height: 11, timestamp: 1} as any;
        fork.enqueueResponse('fork', Promise.resolve());
        appState.stubs.get.returns(false);
        blockLogic.enqueueResponse('objectNormalize', {after: 'normalization'});
        delegates.enqueueResponse('assertValidBlockSlot', Promise.resolve());
        blockVerify.enqueueResponse('verifyReceipt', {verified: true});
        blocksChain.enqueueResponse('deleteLastBlock', Promise.resolve());
        blocksChain.enqueueResponse('deleteLastBlock', Promise.resolve());

        roundsStub.enqueueResponse('calcRound', '1');
        blockVerify.enqueueResponse('processBlock', Promise.resolve());

      });
      it('should call forkModule.fork with ForkType.TYPE_5', async () => {
        await inst.onReceiveBlock(block);
        expect(fork.stubs.fork.called).is.true;
        expect(fork.stubs.fork.firstCall.args[0]).is.deep.eq(block);
        expect(fork.stubs.fork.firstCall.args[1]).is.deep.eq(ForkType.TYPE_5);
      });
      it('should go thorough verification if received block has lower timestamp (older)', async () => {
        block.timestamp                  = 0;
        blocksModule.lastBlock.timestamp = 1;
        await inst.onReceiveBlock(block);
        expect(blockVerify.stubs.verifyReceipt.called).is.true;
      });
      it('should go thorough verification if same timestamp but received block has lower id', async () => {
        block.timestamp                  = 1;
        blocksModule.lastBlock.timestamp = 1;
        block.id                         = '1';
        blocksModule.lastBlock.id        = '2';
        await inst.onReceiveBlock(block);
        expect(blockVerify.stubs.verifyReceipt.called).is.true;
      });
      it('should throw error if verifyReceipt fails', async () => {
        block.timestamp                  = 0;
        blocksModule.lastBlock.timestamp = 1;
        blockVerify.stubs.verifyReceipt.returns({verified: false, errors: ['ERROR']});
        await expect(inst.onReceiveBlock(block)).to.be.rejectedWith('ERROR');
      });
      it('should deleteLastBlock if verifyReceipt suceeds', async () => {
        block.timestamp                  = 0;
        blocksModule.lastBlock.timestamp = 1;
        await inst.onReceiveBlock(block);
        expect(blocksChain.stubs.deleteLastBlock.callCount).is.eq(1);
      });
      it('should update blocksModule receipt if verifyReceipt suceeds', async () => {
        block.timestamp                  = 0;
        blocksModule.lastBlock.timestamp = 1;
        await inst.onReceiveBlock(block);
        expect(blocksModule.spies.lastReceipt.update.called).is.true;
      });
      it('should call verifyModule.processBlock with new block and broadcast=true, saveBlock=true if all good', async () => {
        block.timestamp                  = 0;
        blocksModule.lastBlock.timestamp = 1;
        await inst.onReceiveBlock(block);
        expect(blockVerify.stubs.processBlock.called).is.true;
        expect(blockVerify.stubs.processBlock.firstCall.args[0]).to.be.deep.eq(block);
        expect(blockVerify.stubs.processBlock.firstCall.args[1]).to.be.deep.eq(true);
        expect(blockVerify.stubs.processBlock.firstCall.args[2]).to.be.deep.eq(true);
      });
    });

    it('Block already processed where block.id === lastBlock.id', async () => {
      blocksModule.lastBlock = {id: '1', height: 10, timestamp: 1} as any;
      appState.stubs.get.returns(false);
      await inst.onReceiveBlock({id: '1'} as any);
      expect(loggerStub.stubs.debug.calledOnce).to.be.true;
      expect(loggerStub.stubs.debug.firstCall.args[0]).to.be.equal('Block already processed');
      expect(loggerStub.stubs.debug.firstCall.args[1]).to.be.equal('1');
    });
    it('should call logger.warn if discarded block that does not match with current chain', async () => {
      const roundsLogic: RoundsLogicStub = container.get(Symbols.logic.rounds);
      roundsLogic.enqueueResponse('calcRound', 'round');
      blocksModule.lastBlock = {id: '12', height: 10, timestamp: 1} as any;
      appState.stubs.get.returns(false);
      await inst.onReceiveBlock({id: '1'} as any);
      expect(loggerStub.stubs.warn.calledOnce).to.be.true;
      expect(loggerStub.stubs.warn.firstCall.args[0]).to.be.equal('Discarded block that does not match with current chain: 1 height:  round: round slot: 1 generator: ');
    });
  });

});
