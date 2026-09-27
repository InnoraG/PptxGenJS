FROM quay.io/keycloak/keycloak:26.7.4 AS builder
ENV KC_DB=postgres KC_HEALTH_ENABLED=true KC_METRICS_ENABLED=false KC_HTTP_RELATIVE_PATH=/identity KC_HTTP_MANAGEMENT_RELATIVE_PATH=/
RUN /opt/keycloak/bin/kc.sh build

FROM quay.io/keycloak/keycloak:26.7.4
COPY --from=builder /opt/keycloak/ /opt/keycloak/
COPY --chown=1000:0 --chmod=0555 entrypoint.sh /opt/keycloak/bin/identity-entrypoint.sh
ENV KC_DB=postgres KC_HEALTH_ENABLED=true KC_METRICS_ENABLED=false KC_HTTP_RELATIVE_PATH=/identity KC_HTTP_MANAGEMENT_RELATIVE_PATH=/
ENTRYPOINT ["/bin/bash", "/opt/keycloak/bin/identity-entrypoint.sh"]
CMD ["start", "--optimized", "--import-realm"]
