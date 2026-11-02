const vendorIds = [
  [/nvidia|geforce/i, 0x10de],
  [/intel/i, 0x8086],
  [/amd|radeon/i, 0x1002],
];

/**
 * Picks the device behind the unmasked WebGL renderer by its device ID, so a second GPU cannot lend
 * its driver. Only a renderer without any device ID falls back to a vendor with one distinct driver.
 */
export function rendererDriver(devices, renderer) {
  const byId = devices.find(
    (device) =>
      device.deviceId > 0 &&
      new RegExp(`0x0*${device.deviceId.toString(16)}\\b`, "i").test(renderer),
  );
  if (byId) return byId.driverVersion ? { version: byId.driverVersion, match: "DEVICE_ID" } : null;
  if (/\b0x[0-9a-f]{4,8}\b/i.test(renderer)) return null;
  const vendor = vendorIds.find(([pattern]) => pattern.test(renderer))?.[1];
  // Chromium can list one adapter twice; only a single distinct driver for the vendor is unambiguous.
  const drivers = new Set(
    devices.filter((device) => device.vendorId === vendor).map((device) => device.driverVersion),
  );
  const [only] = drivers;
  return drivers.size === 1 && only ? { version: only, match: "VENDOR_UNIQUE" } : null;
}
