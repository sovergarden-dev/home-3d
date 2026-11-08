export interface GpuDevice {
  vendorId: number;
  deviceId: number;
  driverVersion: string;
}

export interface RendererDriver {
  version: string;
  match: "DEVICE_ID" | "VENDOR_UNIQUE";
}

export function rendererDriver(devices: GpuDevice[], renderer: string): RendererDriver | null;
