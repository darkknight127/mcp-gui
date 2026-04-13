/** GET .../trace/setup — drives Edit-connection trace password UI. */
export type TraceSetupPayload =
  | { advertised: false }
  | { advertised: true; reachable: false; message: string }
  | {
      advertised: true;
      reachable: true;
      password: string | null;
      passwordError?: string;
    };

/** Trace step row returned by GET .../trace/steps (matches server JSON). */
export interface TraceStepDTO {
  id: number;
  connectionId: string;
  batchId: number;
  stepIndex: number;
  toolName: string;
  stepType: string | null;
  durationMs: number | null;
  ok: boolean | null;
  errorText: string | null;
  payloadJson: string;
  serverTs: number | null;
  fetchedAt: string;
}
