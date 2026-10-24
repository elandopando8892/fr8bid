export declare const HTTP_RESPONSE_CONTRACT: "marksman.http-response.v1";
export declare function readJsonResponse(response: Response, mode: "text-or-error"): Promise<{data: any; text: string}>;
export declare function readJsonResponse(response: Response, mode: "json-or-empty"): Promise<{data: any; text: undefined}>;
