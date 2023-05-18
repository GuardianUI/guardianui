"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MockWallet = void 0;
const EIP1193Bridge_1 = require("./EIP1193Bridge");
const ethers_1 = require("ethers");
// We want the wallet to look like Metamask, so we need to implement the same interface
// that they inject to window.ethereum
class MockInternalMetaMask {
    isUnlocked() {
        return true;
    }
}
class MockWallet extends EIP1193Bridge_1.Eip1193Bridge {
    /**
     * @constructor
     * @param signer - The signer for the wallet (private key)
     * @param provider - The RPC provider
     * @param chainId - The chain ID to connect to
     */
    constructor(signer, provider, chainId) {
        super(signer, provider);
        this.isMetaMask = true;
        this.isConnected = () => true;
        this._metamask = new MockInternalMetaMask();
        this.chainId = chainId;
    }
    /**
     * Updates the provider and signer objects in the wallet to use the new chain ID
     * @param chain - The new chain ID to use
     */
    updateChain(chain) {
        // Update the chain ID state variable
        this.chainId = chain;
        // Create new provider and signer objects with the new chain ID
        const newProvider = new ethers_1.ethers.providers.JsonRpcProvider("http://127.0.0.1:8545", chain);
        const newSigner = new ethers_1.Wallet(this.signer.privateKey, newProvider);
        // Update the provider and signer objects in the wallet
        super.setProvider(newProvider);
        super.setSigner(newSigner);
    }
    /**
     * Catch any sendAsync calls and reroute through send to the appropriate method handler
     * @param args - RPC request data arguments
     * @returns - The result of the RPC request
     */
    sendAsync(...args) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.send(...args);
        });
    }
    /**
     * Directs the RPC request to the appropriate method handler with specific approaches for certain
     * methods that may differ from the parent Eip1193Bridge class
     * @param args - RPC request data arguments
     * @returns - The result of the RPC request
     */
    send(...args) {
        const _super = Object.create(null, {
            send: { get: () => super.send }
        });
        return __awaiter(this, void 0, void 0, function* () {
            const isCallbackForm = typeof args[0] === 'object' && typeof args[1] === 'function';
            let callback;
            let method;
            let params;
            // If the RPC request is in callback form, set the callback, method, and params variables
            // else set the method and params variables
            if (isCallbackForm) {
                callback = args[1];
                method = args[0].method;
                params = args[0].params;
            }
            else {
                method = args[0];
                params = args[1];
            }
            // Move control over the return value of the chain ID to the wallet rather than passing along to Anvil
            if (method === "eth_chainId") {
                if (isCallbackForm) {
                    callback(null, { result: ethers_1.ethers.utils.hexlify(this.chainId) });
                }
                else {
                    return Promise.resolve(ethers_1.ethers.utils.hexlify(this.chainId));
                }
            }
            if (method === "eth_requestAccounts" || method === "eth_accounts") {
                if (isCallbackForm) {
                    callback({ result: [this.signer.address] });
                }
                else {
                    return Promise.resolve([this.signer.address]);
                }
            }
            try {
                // Remove the from field from the params object for eth_call requests as it leads to request failures
                if (params && params.length && params[0].from && method === "eth_call") {
                    delete params[0].from;
                }
                let result;
                if (params &&
                    params.length &&
                    params[0].from &&
                    method === "eth_sendTransaction") {
                    // Move the gas field to gasLimit for eth_sendTransaction requests as it leads to request issues
                    params[0].gasLimit = params[0].gas;
                    delete params[0].gas;
                    delete params[0].from;
                    const req = ethers_1.ethers.providers.JsonRpcProvider.hexlifyTransaction(params[0]);
                    req.gasLimit = req.gas;
                    delete req.gas;
                    // Send the transaction through the signer object
                    const tx = yield this.signer.sendTransaction(req);
                    result = tx.hash;
                }
                else if (method === "personal_sign") {
                    // If the method is personal_sign, reroute through eth_sign as personal_sign is not supported by Anvil
                    console.log("MockWallet.send personal_sign is unsupported, rerouting through eth_sign");
                    result = yield _super.send.call(this, 'eth_sign', [params[1], params[0]]);
                }
                else {
                    // Send the RPC request through the parent Eip1193Bridge class
                    result = yield _super.send.call(this, method, params);
                }
                return result;
            }
            catch (e) {
                console.error("MockWallet.send THROWS error", { e }, e.stack);
            }
            finally { }
        });
    }
}
exports.MockWallet = MockWallet;
