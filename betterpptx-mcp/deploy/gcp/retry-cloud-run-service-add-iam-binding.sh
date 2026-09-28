#!/usr/bin/env bash
set -euo pipefail

retry_cloud_run_service_add_iam_binding() {
	local service project region member role attempt delay status
	service="${1:-}"
	project="${2:-}"
	region="${3:-}"
	member="${4:-}"
	role="${5:-}"
	shift $(( $# < 5 ? $# : 5 ))
	local extra_flags=("$@")

	if [[ -z "$service" || -z "$project" || -z "$region" || -z "$member" || -z "$role" ]]; then
		echo 'Usage: retry_cloud_run_service_add_iam_binding SERVICE PROJECT REGION MEMBER ROLE [--condition=None]' >&2
		return 2
	fi
	for flag in "${extra_flags[@]}"; do
		if [[ "$flag" != '--condition=None' ]]; then
			echo 'Only the documented --condition=None option is accepted.' >&2
			return 2
		fi
	done

	for attempt in 1 2 3 4 5 6; do
		if gcloud run services add-iam-policy-binding "$service" \
			--project="$project" --region="$region" --member="$member" --role="$role" \
			"${extra_flags[@]}" --quiet; then
			return 0
		else
			status=$?
		fi
		if [[ "$attempt" == 6 ]]; then
			echo 'Cloud Run IAM binding failed after six attempts.' >&2
			return "$status"
		fi
		delay=$(( 2 ** (attempt - 1) ))
		if (( delay > 30 )); then delay=30; fi
		echo "Cloud Run IAM binding did not apply; retrying in ${delay}s (attempt ${attempt}/6)." >&2
		sleep "$delay"
	done
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
	retry_cloud_run_service_add_iam_binding "$@"
fi
