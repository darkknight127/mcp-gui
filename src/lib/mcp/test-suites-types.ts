export type AssertionKind =
  | "none"
  | "response_success"
  | "response_error"
  | "output_schema";

export interface PersistedSuiteStep {
  id: string;
  toolName: string;
  argValues: Record<string, string>;
  assertion: AssertionKind;
  schemaText: string;
}

export interface PersistedTestSuite {
  id: string;
  name: string;
  steps: PersistedSuiteStep[];
}
