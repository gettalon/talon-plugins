export declare class BrowserBridgeServer {
    private client;
    private pending;
    private authToken;
    private port;
    constructor(port?: number);
    start(): Promise<void>;
    private writeDiscoveryFiles;
    private installNativeMessagingHost;
    private findExtensionId;
    cleanupDiscoveryFiles(): void;
    private handleHttp;
    sendCommand(action: string, params: Record<string, unknown>): Promise<unknown>;
    get isConnected(): boolean;
}
