import * as THREE from "three";
import type { CameraPose } from "@/memories/camera";

export function poseToOrbit(pose: CameraPose, position = new THREE.Vector3()) {
  const radius = pose.distance * Math.cos(pose.pitch);
  return position.set(
    pose.target[0] + Math.sin(pose.yaw) * radius,
    pose.target[1] + pose.distance * Math.sin(pose.pitch),
    pose.target[2] + Math.cos(pose.yaw) * radius,
  );
}
