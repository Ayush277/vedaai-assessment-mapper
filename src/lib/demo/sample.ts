import type { AssessmentResult } from "@/lib/types/assessment";
import sampleResult from "./sample-result.json";

/**
 * A saved run of the real pipeline over `fixtures/`, captured by
 * `npm run capture:demo`. It exists so the interface can be explored without
 * spending API credits — it is never used by the upload flow, which always
 * runs the live pipeline.
 */
export const DEMO_RESULT = sampleResult as unknown as AssessmentResult;
