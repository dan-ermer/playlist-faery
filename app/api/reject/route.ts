import { decisionRoute } from "@/lib/decision-route";

// Reject link from the approval email: /api/reject?token=...
export const { GET, POST } = decisionRoute("reject");
