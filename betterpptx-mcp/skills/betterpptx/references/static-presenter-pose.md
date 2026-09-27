# Stopped presenter posture

Use `staticPose: { motionId: "motion.ordinary.point", timeMs: 926 }` to choose an intentional stopped/edit-view posture from an unchanged approved ordinary Joe, Louise, or Pete model. Put it on the deck `presenter`, override it with `slides[].presenter.staticPose`, or put it on a native `model3d` content block. Cast entries accept it too; a `slides[].scene[]` beat may override its actor's value.

The choice is independent of placement and playback. It does not resize the person, change the camera, adjust appearance, accelerate motion, or set a playback start offset. When playback begins, the selected scene still begins at its original start, so a visible change from the stopped posture is possible. The existing compatibility poster is retained; it is not proof of the newly selected native posture.

On an approved native model with `staticPose` (including a null reset), `scene.motionId` selects playback independently, for example `scene: { motionId: "motion.ordinary.point", length: 3625, loop: true }`. Effective export uses this semantic motion name and preserves the original duration and looping. Selecting a stopped frame does not change that scene choice or its start time.

For the semantic deck-presenter route, select playback with `slides[].presenterMotion: { presenterId: "host", motionId: "motion.ordinary.point" }` and use `presenter.id: "host"`. The approved ordinary-pose lane resolves that existing motion directly; it does not need or build a new motion bundle.

Select an exact `motion.ordinary.*` ID and a nonnegative `timeMs` within that motion. A construction T-pose is refused. Custom, kinetic, rebuilt, or already-posed source banks are refused. Do not combine this pose with `motionTime.kineticSelection`, a kinetic rebuild, interaction-generated presenter insertion, or the poster-based `motionPolicy: "static"` route.

Both dryRun and commit validate the original approved asset and the sampled frame. After commit, effective spec export retains an opaque reference to the original asset and the requested `staticPose`, so a replay samples the original again rather than compounding changes. Its `staticPoses` readback explicitly reports `playbackStartOffsetApplied: false`. To change the pose, edit those two fields and rebuild through `generate_from_spec` using `commitMode: "replaceDeck"` or `"createNew"`. In-place shape patches cannot change it. Set `staticPose: null` to restore the original safe opening pose; on a slide or cast beat, null explicitly cancels an inherited pose.

Always preview the native PowerPoint result before claiming visual parity. Inspect the stopped posture as well as actual playback; neither the successful dryRun nor the poster proves the intended pose is visible.
