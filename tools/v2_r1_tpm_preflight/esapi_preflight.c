#ifndef STEP27_ESAPI_PREFLIGHT_FIXTURE
#error "Step27 ESAPI preflight is fixture-only; a later authorized host integration is required."
#endif

#include "esapi_preflight.h"

static int exact(enum step27_esapi_fact fact, enum step27_esapi_fact expected) {
  return fact == expected;
}

enum step27_preflight_result step27_evaluate_esapi_capabilities(
    const struct step27_esapi_capabilities *capabilities) {
  if (!capabilities) return STEP27_PREFLIGHT_DENY_OPAQUE;
  if (!exact(capabilities->presence, STEP27_ESAPI_FACT_PRESENT) ||
      !exact(capabilities->version, STEP27_ESAPI_FACT_TPM2) ||
      !exact(capabilities->nv_counter, STEP27_ESAPI_FACT_NV_COUNTER) ||
      !exact(capabilities->policy_primitives, STEP27_ESAPI_FACT_POLICY_PRIMITIVES) ||
      !exact(capabilities->opaque_identity, STEP27_ESAPI_FACT_OPAQUE_IDENTITY)) {
    return STEP27_PREFLIGHT_DENY_OPAQUE;
  }
  return STEP27_PREFLIGHT_COMPATIBLE;
}
/* No TPM headers, ESAPI context, transport, host command, I/O, or TPM operation exists here. */
