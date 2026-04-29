import dotenv from "dotenv";
dotenv.config({ path: ".env" });

import { checkRelevanceBatch, parseEmailBody } from "../lib/llm-parser";

async function runConfidenceTests() {
  console.log("==========================================");
  console.log("      LLM CONFIDENCE PARSING TEST         ");
  console.log("==========================================\n");

  // Test 1: Stage 1 Header Relevance (Ambiguous vs Clear)

  console.log(">>> TEST 1: Stage 1 Header Relevance Check");

  const applications = [
    { application_id: 1, company_name: "Acme Corp", job_title: "Software Engineer" },
    { application_id: 2, company_name: "Stark Industries", job_title: "Data Analyst" },
  ];

  const headersParams = [
    {
      messageId: "msg-clear-1",
      subject: "Interview Invitation: Acme Corp - Software Engineer",
      sender: "recruiting@acmecorp.com"
    },
    {
      messageId: "msg-ambiguous-1",
      subject: "Update on your recent application",
      sender: "no-reply@workday.com"
    },
    {
      messageId: "msg-clear-reject",
      subject: "Rejection: Stark Industries Data Analyst Position",
      sender: "careers@stark.com"
    },
    {
      messageId: "msg-extremely-vague",
      subject: "Following up",
      sender: "some-guy@gmail.com"
    }
  ];

  try {
    const stage1Results = await checkRelevanceBatch(headersParams, applications);
    console.log("--- Stage 1 Outcomes ---");
    stage1Results.forEach(r => {
      console.log(`Email [${r.messageId}] -> Relevant: ${r.relevant} | Confidence: ${r.confidence}`);
    });
  } catch (err) {
    console.error("Stage 1 test failed:", err);
  }

  console.log("\n==========================================\n");

  // Test 2: Stage 2 Body Parsing (Ambiguous vs Clear)

  console.log(">>> TEST 2: Stage 2 Body Parsing Check\n");

  const clearContext = {
    company_name: "Acme Corp",
    job_title: "Software Engineer",
    status: "applied"
  };

  const clearBody = `
    Hi there,
    Congratulations! We would like to formally extend an offer for the Software Engineer role at Acme Corp.
    The salary will be $55/hr. This is a hybrid role based out of our San Francisco location.
    Please let us know if you accept.
    Best, Sarah (Engineering Manager)
  `;

  const ambiguousBody = `
    Hey,
    Thanks for applying. We are still reviewing things on our end. 
    Things are moving a bit slow but we should have an update regarding the position soon.
    We might ask you to come into the office occasionally if you proceed to the next round.
    Best, the team.
  `;

  try {
    console.log("Testing CLEAR Body:");
    const parsedClear = await parseEmailBody(
      "Offer for Software Engineer",
      "sarah@acmecorp.com",
      clearBody,
      clearContext
    );
    console.log("Parsed CLEAR Result:", JSON.stringify(parsedClear, null, 2));

    console.log("\nTesting AMBIGUOUS Body:");
    const parsedAmbiguous = await parseEmailBody(
      "Update on your application",
      "team@acmecorp.com",
      ambiguousBody,
      clearContext
    );
    console.log("Parsed AMBIGUOUS Result:", JSON.stringify(parsedAmbiguous, null, 2));
  } catch (err) {
    console.error("Stage 2 test failed:", err);
  }
}

runConfidenceTests();
