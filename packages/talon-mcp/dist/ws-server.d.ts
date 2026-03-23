type ChatHandler = (chatId: string, text: string, context?: Record<string, string>) => void;
export declare class BrowserBridgeServer {
    private client;
    private pending;
    private chatHandler;
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
    onChatMessage(handler: ChatHandler): void;
    sendChatReply(chatId: string, text: string): void;
    private seqCounter;
    private sendEvent;
    sendToolUse(callId: string, toolName: string, args: Record<string, unknown>): void;
    sendToolResult(callId: string, toolName: string, output: string, isError?: boolean): void;
    sendToolProgress(callId: string, toolName: string, elapsed: number): void;
    sendStatus(message: string): void;
    get isConnected(): boolean;
}
export {};
