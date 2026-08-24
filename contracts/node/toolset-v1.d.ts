export declare const kasbOperationNames: readonly ["search-standards", "get-standard-structure", "get-section", "get-paragraph", "search-qna", "get-qna"];
export type KasbOperationName = (typeof kasbOperationNames)[number];
export declare const kasbSingleToolActions: readonly ["help", "command_help", "validate", "run"];
export type KasbSingleToolAction = (typeof kasbSingleToolActions)[number];
export type KasbSingleToolRunAction = Extract<KasbSingleToolAction, "validate" | "run">;
export type KasbToolRunContext = {
    readonly signal?: AbortSignal;
};
export type KasbOperationSummary = {
    readonly name: KasbOperationName;
    readonly label: string;
    readonly description: string;
};
export type KasbOperationSpec = KasbOperationSummary & {
    readonly inputJsonSchema: unknown;
    readonly resultJsonSchema: unknown;
    readonly requiredInputKeys: readonly string[];
    readonly examples: readonly Record<string, unknown>[];
    readonly limitations: readonly string[];
    readonly resultSummary: string;
};
export type KasbCommandHelp = KasbOperationSpec;
export type KasbToolsetHelp = {
    readonly id: "kasb";
    readonly label: string;
    readonly description: string;
    readonly usage: string;
    readonly operations: readonly KasbOperationSummary[];
    readonly limitations: readonly string[];
    readonly citationGuidance: readonly string[];
};
export type KasbValidationFailureCode = "missing_parameter" | "invalid_parameter" | "unknown_parameter" | "invalid_request";
export type KasbValidationRecoveryAction = {
    readonly kind: "inspect_tool_help";
} | {
    readonly kind: "inspect_command_help";
    readonly operationName: string;
};
export type KasbValidationFailure = {
    readonly code: KasbValidationFailureCode;
    readonly message: string;
    readonly operationName?: string;
    readonly parameter?: string;
    readonly reason?: string;
    readonly expected?: string;
    readonly actual?: unknown;
    readonly recoveryHint?: string;
    readonly exampleInput?: Record<string, unknown>;
    /** True when a caller can repair the request by changing input or inspecting help. */
    readonly recoverable: boolean;
    /** True only when the same request might succeed later, such as transient source availability. */
    readonly retryable: boolean;
    readonly recoveryAction?: KasbValidationRecoveryAction;
};
export type KasbValidationResult = {
    readonly ok: true;
    readonly input: Record<string, unknown>;
} | {
    readonly ok: false;
    readonly error: KasbValidationFailure;
};
export type KasbSerializedError = {
    readonly name: string;
    readonly message: string;
    readonly code?: string;
    readonly recoverable?: boolean;
    readonly retryable?: boolean;
    readonly parameter?: string;
    readonly sourceUrl?: string;
    readonly recoveryHint?: string;
    readonly recoveryAction?: KasbValidationRecoveryAction;
    readonly operationName?: string;
};
export type KasbToolset = {
    readonly id: "kasb";
    readonly label: string;
    readonly description: string;
    readonly help: () => KasbToolsetHelp;
    readonly listOperations: () => readonly KasbOperationSummary[];
    readonly getOperation: (name: string) => KasbOperationSpec | undefined;
    readonly getCommandHelp: (name: string) => KasbOperationSpec | undefined;
    readonly validateInput: (name: string, input: unknown) => KasbValidationResult;
    readonly execute: (name: string, input: Record<string, unknown>, context?: KasbToolRunContext) => Promise<unknown>;
    readonly serializeError: (error: unknown) => KasbSerializedError;
};
export type KasbSingleToolCopy = {
    readonly description: string;
    readonly promptSnippet: string;
    readonly promptGuidelines: readonly string[];
    readonly parameterDescriptions: {
        readonly action: string;
        readonly command: string;
        readonly inputJson: string;
    };
    readonly actionSummaries: Record<KasbSingleToolAction, string>;
};
export type KasbToolsetErrorCode = "unknown_operation" | "aborted";
export declare class KasbToolsetError extends Error {
    readonly name = "KasbToolsetError";
    readonly code: KasbToolsetErrorCode;
    readonly recoverable: boolean | undefined;
    readonly retryable: boolean;
    readonly recoveryHint: string | undefined;
    readonly recoveryAction: KasbValidationRecoveryAction | undefined;
    readonly operationName: string | undefined;
    constructor(input: {
        readonly code: KasbToolsetErrorCode;
        readonly message: string;
        readonly recoverable?: boolean;
        readonly retryable: boolean;
        readonly recoveryHint?: string;
        readonly recoveryAction?: KasbValidationRecoveryAction;
        readonly operationName?: string;
    });
}
export declare const createKasbUnknownOperationError: (operationName: string) => KasbToolsetError;
type AppOperation = {
    readonly name: KasbOperationName;
    readonly inputJsonSchema: unknown;
    readonly resultJsonSchema: unknown;
    readonly execute: (input: Record<string, unknown>, context?: KasbToolRunContext) => Promise<unknown>;
};
export type KasbOperationDefinition = KasbOperationSummary & {
    readonly operation: AppOperation;
    readonly examples: readonly Record<string, unknown>[];
    readonly limitations: readonly string[];
    readonly resultSummary: string;
    readonly prepareInput: (input: unknown) => Record<string, unknown>;
};
export type CreateKasbToolsetOptions = {
    /** Override operations for tests or custom hosts. Default uses the KASB-backed operations. */
    readonly operations?: readonly KasbOperationDefinition[];
};
export declare const kasbSingleToolCopy: {
    readonly description: "Read-only search and retrieval for KASB standards and Q&A source material with references, warnings, and metadata.";
    readonly promptSnippet: "Use kasb(action, command?, inputJson?) to search KASB standards, inspect structures, retrieve sections/paragraphs, and read Q&A material.";
    readonly promptGuidelines: readonly ["Do not guess command names; call action=help first to inspect available KASB commands.", "Use action=command_help when required keys, allowed values, examples, limitations, or result shapes are unclear.", "Use action=validate to repair or normalize command input without contacting KASB.", "Use action=run only after constructing command input. Kasb validates before execution and returns source references, warnings, and metadata for citation.", "Use JSON fields such as stdNum, indexDocumentId, paraNum, and docNumber directly in inputJson. Do not pass CLI flags, source searchWord, or browser titleDocumentId values."];
    readonly parameterDescriptions: {
        readonly action: "Kasb tool action: one of help, command_help, validate, or run.";
        readonly command: "Canonical KASB operation name, such as search-standards or get-paragraph.";
        readonly inputJson: "Command input object matching the selected KASB operation's JSON input contract.";
    };
    readonly actionSummaries: {
        readonly help: "Return source-level help and the command menu.";
        readonly command_help: "Return one command schema, examples, limitations, and result summary.";
        readonly validate: "Validate and normalize one command input without contacting KASB.";
        readonly run: "Validate and execute one command.";
    };
};
export declare const formatKasbToolsetHelp: (help: KasbToolsetHelp) => string;
export declare const formatKasbCommandHelp: (commandHelp: KasbCommandHelp) => string;
export declare const formatKasbValidationSuccess: (command: string, validation: Extract<KasbValidationResult, {
    ok: true;
}>) => string;
export declare const formatKasbValidationFailure: (action: KasbSingleToolRunAction, command: string, error: KasbValidationFailure) => string;
export declare const formatKasbRunSuccess: (command: string, result: unknown) => string;
export declare const formatKasbRunFailure: (command: string, error: KasbSerializedError) => string;
export declare const formatKasbInvalidToolInput: (error: KasbValidationFailure) => string;
export declare const formatKasbUnknownCommand: (command: string, error: KasbSerializedError) => string;
export declare const createKasbSingleToolActionFailure: (actual: unknown) => KasbValidationFailure;
export declare const createKasbSingleToolCommandFailure: (action: KasbSingleToolAction, command: unknown) => KasbValidationFailure;
export declare const createKasbSingleToolInputJsonFailure: (action: KasbSingleToolRunAction, command: string, inputJson: unknown) => KasbValidationFailure;
export declare const serializeKasbError: (error: unknown) => KasbSerializedError;
export declare const createKasbToolset: (options?: CreateKasbToolsetOptions) => KasbToolset;
export {};
