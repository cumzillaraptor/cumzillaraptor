#ifndef STEP27_ESAPI_PREFLIGHT_H
#define STEP27_ESAPI_PREFLIGHT_H

/* Fixture-only model: these are injected observations, not ESAPI handles or TPM data. */
enum step27_esapi_fact {
  STEP27_ESAPI_FACT_PRESENT = 1,
  STEP27_ESAPI_FACT_TPM2 = 2,
  STEP27_ESAPI_FACT_NV_COUNTER = 3,
  STEP27_ESAPI_FACT_POLICY_PRIMITIVES = 4,
  STEP27_ESAPI_FACT_OPAQUE_IDENTITY = 5
};

enum step27_preflight_result {
  STEP27_PREFLIGHT_COMPATIBLE = 1,
  STEP27_PREFLIGHT_DENY_OPAQUE = 2
};

struct step27_esapi_capabilities {
  enum step27_esapi_fact presence;
  enum step27_esapi_fact version;
  enum step27_esapi_fact nv_counter;
  enum step27_esapi_fact policy_primitives;
  enum step27_esapi_fact opaque_identity;
};

enum step27_preflight_result step27_evaluate_esapi_capabilities(
    const struct step27_esapi_capabilities *capabilities);

#endif
