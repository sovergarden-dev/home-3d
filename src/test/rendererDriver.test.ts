import { describe, expect, it } from "vitest";
import { rendererDriver } from "../../scripts/renderer-driver.mjs";

// Fictional IDs and versions; only their shape matters.
const nvidia = { vendorId: 0x10de, deviceId: 0x1234, driverVersion: "1.0.0" };
const intel = { vendorId: 0x8086, deviceId: 0x5678, driverVersion: "2.0.0" };
const angle = (adapter: string, id: string) =>
  `ANGLE (NVIDIA, ${adapter} (${id}) Direct3D11, D3D11)`;

describe("rendererDriver", () => {
  it("takes the driver of the device whose ID the renderer names, beside a second GPU", () => {
    expect(rendererDriver([intel, nvidia], angle("NVIDIA GeForce", "0x00001234"))).toEqual({
      version: "1.0.0",
      match: "DEVICE_ID",
    });
  });
  it("does not borrow the vendor's driver when the renderer names an unlisted device", () => {
    expect(rendererDriver([intel, nvidia], angle("NVIDIA GeForce", "0x00009abc"))).toBeNull();
  });
  it("falls back to the vendor only without a device ID and with one distinct driver", () => {
    const renderer = "NVIDIA GeForce/PCIe/SSE2";
    // Chromium can list the same adapter twice.
    expect(rendererDriver([nvidia, nvidia, intel], renderer)).toEqual({
      version: "1.0.0",
      match: "VENDOR_UNIQUE",
    });
    const second = { ...nvidia, deviceId: 0x9abc, driverVersion: "3.0.0" };
    expect(rendererDriver([nvidia, second], renderer)).toBeNull();
  });
});
