import { Provider } from "@project-serum/anchor";
import type {
  TransactionSignature,
  ConfirmOptions,
  Transaction,
  Signer,
  SendOptions,
  SimulatedTransactionResponse,
  Commitment,
} from "@solana/web3.js";
import { Connection, PublicKey, VersionedTransaction } from "@solana/web3.js";
import { Blockchain } from "@coral-xyz/common";
import type { Event } from "@coral-xyz/common";
import {
  getLogger,
  BackgroundSolanaConnection,
  DEFAULT_SOLANA_CLUSTER,
  CHANNEL_BLOCKCHAIN_NOTIFICATION,
  SOLANA_RPC_METHOD_CONNECT,
  SOLANA_RPC_METHOD_DISCONNECT,
  SOLANA_RPC_METHOD_OPEN_XNFT,
  NOTIFICATION_BLOCKCHAIN_CONNECTED,
  NOTIFICATION_BLOCKCHAIN_DISCONNECTED,
  NOTIFICATION_SOLANA_CONNECTION_URL_UPDATED,
  NOTIFICATION_SOLANA_ACTIVE_WALLET_UPDATED,
} from "@coral-xyz/common";
import * as cmn from "./common/solana";
import { RequestManager } from "./request-manager";
import { PrivateEventEmitter } from "./common/PrivateEventEmitter";

const logger = getLogger("provider-solana-injection");

export class ProviderSolanaInjection
  extends PrivateEventEmitter
  implements Provider
{
  //
  // Channel to send extension specific RPC requests to the extension.
  //
  #requestManager: RequestManager;
  //
  // Channel to send Solana Connection API requests to the extension.
  //
  #connectionRequestManager: RequestManager;

  #isBackpack: boolean;
  #isConnected: boolean;
  #publicKey?: PublicKey;
  #connection: Connection;

  constructor(
    requestManager: RequestManager,
    connectionRequestManager: RequestManager
  ) {
    super();
    if (new.target === ProviderSolanaInjection) {
      Object.freeze(this);
    }
    this.#requestManager = requestManager;
    this.#connectionRequestManager = connectionRequestManager;
    this.#initChannels();
    this.#isBackpack = true;
    this.#isConnected = false;
    this.#publicKey = undefined;
    this.#connection = this.defaultConnection();
  }

  defaultConnection(): Connection {
    return new Connection(
      // check rollup.config.ts for this env var
      process.env.DEFAULT_SOLANA_CONNECTION_URL || DEFAULT_SOLANA_CLUSTER
    );
  }

  // Setup channels with the content script.
  #initChannels() {
    window.addEventListener("message", this.#handleNotification.bind(this));
  }

  #handleNotification(event: Event) {
    if (
      event.data.type !== CHANNEL_BLOCKCHAIN_NOTIFICATION ||
      event.data.detail.blockchain !== Blockchain.SOLANA
    ) {
      return;
    }

    logger.debug("notification", event);

    switch (event.data.detail.name) {
      case NOTIFICATION_BLOCKCHAIN_CONNECTED:
        break;
      case NOTIFICATION_BLOCKCHAIN_DISCONNECTED:
        this.#handleNotificationDisconnected();
        break;
      case NOTIFICATION_SOLANA_CONNECTION_URL_UPDATED:
        this.#handleNotificationConnectionUrlUpdated(event);
        break;
      case NOTIFICATION_SOLANA_ACTIVE_WALLET_UPDATED:
        this.#handleNotificationActiveWalletUpdated(event);
        break;
      default:
        throw new Error(`unexpected notification ${event.data.detail.name}`);
    }

    this.emit(_mapNotificationName(event.data.detail.name));
  }

  #connect(publicKey: string, connectionUrl: string) {
    this.#isConnected = true;
    this.#publicKey = new PublicKey(publicKey);
    this.#connection = new BackgroundSolanaConnection(
      this.#connectionRequestManager,
      connectionUrl
    );
  }

  #handleNotificationDisconnected() {
    this.#isConnected = false;
    this.#connection = this.defaultConnection();
  }

  #handleNotificationConnectionUrlUpdated(event: Event) {
    this.#connection = new BackgroundSolanaConnection(
      this.#connectionRequestManager,
      event.data.detail.data.url
    );
  }

  #handleNotificationActiveWalletUpdated(event: Event) {
    this.#publicKey = new PublicKey(event.data.detail.data.activeWallet);
  }

  async connect() {
    if (this.#isConnected) {
      throw new Error("provider already connected");
    }
    // Send request to the RPC API.
    const result = await this.#requestManager.request({
      method: SOLANA_RPC_METHOD_CONNECT,
      params: [],
    });

    this.#connect(result.publicKey, result.connectionUrl);
  }

  async disconnect() {
    await this.#requestManager.request({
      method: SOLANA_RPC_METHOD_DISCONNECT,
      params: [],
    });
    this.#connection = this.defaultConnection();
  }

  async openXnft(xnftAddress: PublicKey) {
    await this.#requestManager.request({
      method: SOLANA_RPC_METHOD_OPEN_XNFT,
      params: [xnftAddress.toString()],
    });
  }

  async sendAndConfirm<T extends Transaction | VersionedTransaction>(
    tx: T,
    signers?: Signer[],
    options?: ConfirmOptions,
    connection?: Connection,
    publicKey?: PublicKey
  ): Promise<TransactionSignature> {
    if (!this.#publicKey) {
      throw new Error("wallet not connected");
    }
    return await cmn.sendAndConfirm(
      publicKey ?? this.#publicKey,
      this.#requestManager,
      connection ?? this.#connection,
      tx,
      signers,
      options
    );
  }

  async send<T extends Transaction | VersionedTransaction>(
    tx: T,
    signers?: Signer[],
    options?: SendOptions,
    connection?: Connection,
    publicKey?: PublicKey
  ): Promise<TransactionSignature> {
    if (!this.#publicKey) {
      throw new Error("wallet not connected");
    }
    return await cmn.send(
      publicKey ?? this.#publicKey,
      this.#requestManager,
      connection ?? this.#connection,
      tx,
      signers,
      options
    );
  }

  // @ts-ignore
  async sendAll<T extends Transaction | VersionedTransaction>(
    _txWithSigners: { tx: T; signers?: Signer[] }[],
    _opts?: ConfirmOptions
  ): Promise<Array<TransactionSignature>> {
    throw new Error("sendAll not implemented");
  }

  // @ts-ignore
  async simulate<T extends Transaction | VersionedTransaction>(
    tx: T,
    signers?: Signer[],
    commitment?: Commitment,
    connection?: Connection,
    publicKey?: PublicKey
  ): Promise<SimulatedTransactionResponse> {
    if (!this.#publicKey) {
      throw new Error("wallet not connected");
    }
    return await cmn.simulate(
      publicKey ?? this.#publicKey,
      this.#requestManager,
      connection ?? this.#connection,
      tx,
      signers,
      commitment
    );
  }

  async signTransaction<T extends Transaction | VersionedTransaction>(
    tx: T,
    publicKey?: PublicKey,
    connection?: Connection
  ): Promise<T> {
    if (!this.#publicKey) {
      throw new Error("wallet not connected");
    }
    return await cmn.signTransaction(
      publicKey ?? this.#publicKey,
      this.#requestManager,
      connection ?? this.#connection,
      tx
    );
  }

  async signAllTransactions<T extends Transaction | VersionedTransaction>(
    txs: Array<T>,
    publicKey?: PublicKey,
    connection?: Connection
  ): Promise<Array<T>> {
    if (!this.#publicKey) {
      throw new Error("wallet not connected");
    }
    return await cmn.signAllTransactions(
      publicKey ?? this.#publicKey,
      this.#requestManager,
      connection ?? this.#connection,
      txs
    );
  }

  async signMessage(
    msg: Uint8Array,
    publicKey?: PublicKey
  ): Promise<Uint8Array> {
    if (!this.#publicKey) {
      throw new Error("wallet not connected");
    }
    return await cmn.signMessage(
      publicKey ?? this.#publicKey,
      this.#requestManager,
      msg
    );
  }

  public get isBackpack() {
    return this.#isBackpack;
  }

  public get isConnected() {
    return this.#isConnected;
  }

  public get publicKey() {
    return this.#publicKey;
  }

  public get connection() {
    return this.#connection;
  }
}

// Maps the notification name (internal) to the event name.
function _mapNotificationName(notificationName: string) {
  switch (notificationName) {
    case NOTIFICATION_BLOCKCHAIN_CONNECTED:
      return "connect";
    case NOTIFICATION_BLOCKCHAIN_DISCONNECTED:
      return "disconnect";
    case NOTIFICATION_SOLANA_CONNECTION_URL_UPDATED:
      return "connectionDidChange";
    case NOTIFICATION_SOLANA_ACTIVE_WALLET_UPDATED:
      return "activeWalletDidChange";
    default:
      throw new Error(`unexpected notification name ${notificationName}`);
  }
}
