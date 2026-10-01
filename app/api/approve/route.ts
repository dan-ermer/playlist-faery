import { decisionRoute } from "@/lib/decision-route";

// Approve link from the approval email: /api/approve?token=...
export const { GET, POST } = decisionRoute("approve");
