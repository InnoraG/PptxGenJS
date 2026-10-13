import type {MotionOwner} from './motion-preparation-runtime.d.ts';

export declare const TRUSTED_MOTION_PREPARATION_REPOSITORY_SCHEMA_VERSION:
	'betterpptx.trusted-motion-preparation-repository.v1';

export type TrustedMotionPreparationRepositoryContract = Readonly<{
	schemaVersion: typeof TRUSTED_MOTION_PREPARATION_REPOSITORY_SCHEMA_VERSION;
}>;

export declare function assertTrustedMotionPreparationRepository<T extends object>(
	repository: T,
): T & TrustedMotionPreparationRepositoryContract;

export declare function motionPreparationTargetResourceId(handle: string, owner: MotionOwner): string;
export declare function isMotionPreparationEligibilityRefusal(error: unknown): boolean;
