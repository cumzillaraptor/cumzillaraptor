#include "../../tools/v2_r1_tpm_preflight/esapi_preflight.h"

#include <stdio.h>

static int expect(enum step27_preflight_result actual,
                  enum step27_preflight_result expected) {
  return actual == expected;
}

static struct step27_esapi_capabilities compatible(void) {
  const struct step27_esapi_capabilities facts = {
    STEP27_ESAPI_FACT_PRESENT,
    STEP27_ESAPI_FACT_TPM2,
    STEP27_ESAPI_FACT_NV_COUNTER,
    STEP27_ESAPI_FACT_POLICY_PRIMITIVES,
    STEP27_ESAPI_FACT_OPAQUE_IDENTITY
  };
  return facts;
}

int main(void) {
  struct step27_esapi_capabilities facts = compatible();
  int checks = 0;

  checks += expect(step27_evaluate_esapi_capabilities(&facts),
                   STEP27_PREFLIGHT_COMPATIBLE);
  checks += expect(step27_evaluate_esapi_capabilities(NULL),
                   STEP27_PREFLIGHT_DENY_OPAQUE);

  facts = compatible();
  facts.presence = STEP27_ESAPI_FACT_TPM2;
  checks += expect(step27_evaluate_esapi_capabilities(&facts),
                   STEP27_PREFLIGHT_DENY_OPAQUE);
  facts = compatible();
  facts.version = STEP27_ESAPI_FACT_PRESENT;
  checks += expect(step27_evaluate_esapi_capabilities(&facts),
                   STEP27_PREFLIGHT_DENY_OPAQUE);
  facts = compatible();
  facts.nv_counter = STEP27_ESAPI_FACT_PRESENT;
  checks += expect(step27_evaluate_esapi_capabilities(&facts),
                   STEP27_PREFLIGHT_DENY_OPAQUE);
  facts = compatible();
  facts.policy_primitives = STEP27_ESAPI_FACT_PRESENT;
  checks += expect(step27_evaluate_esapi_capabilities(&facts),
                   STEP27_PREFLIGHT_DENY_OPAQUE);
  facts = compatible();
  facts.opaque_identity = STEP27_ESAPI_FACT_PRESENT;
  checks += expect(step27_evaluate_esapi_capabilities(&facts),
                   STEP27_PREFLIGHT_DENY_OPAQUE);

  if (checks != 7) {
    puts("esapi preflight fixture: rejected");
    return 1;
  }
  puts("esapi preflight fixture: 7 checks passed");
  return 0;
}
