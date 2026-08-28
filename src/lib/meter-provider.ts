import { getDeviceParams, resolveEwelinkConfig, type EwelinkConfig } from "@/lib/ewelink";
import { LIVE_PARAM_KEYS, readElectrical } from "@/lib/ewelink-scale";

/**
 * One vendor-shaped read of a meter, and the interface every vendor
 * implements. ADR-010 requires meter work to sit behind a provider-agnostic
 * interface so a vendor can only ever be swapped, never force a rewrite of
 * anything downstream — and here it earns its keep immediately: the polling,
 * health and alerting machine is testable against a stub while the eWeLink
 * credentials are still with CoolKit's review team.
 */
export type MeterRead = {
  online: boolean;
  powerW: number | null;
  voltageV: number | null;
  currentA: number | null;
  /** The device's own counter for the calendar day so far. */
  dayKwh: number | null;
  /** The device's own counter for the calendar month so far. */
  monthKwh: number | null;
  /**
   * False when this device type's scale has never been established, in which
   * case every figure above is null. See `ewelink-scale.ts` — a number shown
   * at an unknown scale reads as fact, and is the one failure this whole
   * module is built to avoid.
   */
  scaleKnown: boolean;
  /**
   * When the DEVICE last reported, if the vendor says. Null means unknown —
   * not "now". eWeLink's status read returns parameters without a device
   * timestamp, so a stale cloud value is indistinguishable from a fresh one,
   * and the screen must not claim otherwise.
   */
  reportedAt: Date | null;
};

export type MeterProvider = {
  name: string;
  /** Whether this provider can date a device's own report. */
  reportsDeviceTime: boolean;
  /** `uiid` decides how the vendor's raw figures are scaled. */
  readNow(deviceId: string, uiid: number): Promise<MeterRead>;
};

export function ewelinkProvider(cfg: EwelinkConfig): MeterProvider {
  return {
    name: "ewelink",
    reportsDeviceTime: false,
    async readNow(deviceId: string, uiid: number): Promise<MeterRead> {
      const params = await getDeviceParams(cfg, deviceId, LIVE_PARAM_KEYS);
      return {
        // A device that answers with parameters is reachable; the absence of
        // an explicit false is not evidence of trouble.
        online: params.online === undefined ? true : Boolean(params.online),
        ...readElectrical(uiid, params),
        reportedAt: null,
      };
    },
  };
}

/**
 * A deterministic stand-in, for developing against while the real account is
 * unavailable — CoolKit publishes no sandbox and issues no demo credentials,
 * so without this the polling, health and alerting machine could not be
 * exercised at all until an application is approved.
 *
 * Deliberately env-gated and loud: it exists to make the machine runnable,
 * not to make a screen look populated. Its samples are telemetry, which by
 * construction never reaches the store a bill is computed from (that path
 * requires a reviewed RawReadingFile — CON-45), so a fake reading can never
 * become a fake invoice.
 */
export function fakeProvider(): MeterProvider {
  return {
    name: "fake",
    reportsDeviceTime: true,
    async readNow(deviceId: string): Promise<MeterRead> {
      // Derived from the device id and the hour, so a series looks like a
      // series rather than noise, and a device ending in "-down" is always
      // unreachable — that is how the offline path gets exercised.
      if (deviceId.endsWith("-down")) {
        return {
          online: false,
          powerW: null,
          voltageV: null,
          currentA: null,
          dayKwh: null,
          monthKwh: null,
          scaleKnown: true,
          reportedAt: null,
        };
      }
      const seed = [...deviceId].reduce((n, c) => n + c.charCodeAt(0), 0);
      const hour = new Date().getUTCHours();
      const powerW = 400 + ((seed + hour * 37) % 260);
      return {
        online: true,
        powerW,
        voltageV: 231.2,
        currentA: Number((powerW / 231.2 / 0.9).toFixed(2)),
        dayKwh: Number(((powerW * hour) / 1000).toFixed(2)),
        monthKwh: Number(((powerW * 24 * 12) / 1000).toFixed(2)),
        scaleKnown: true,
        reportedAt: new Date(),
      };
    },
  };
}

/** The configured provider, or null when nothing is configured yet. */
export async function resolveMeterProvider(): Promise<MeterProvider | null> {
  if (process.env.EWELINK_FAKE_METERS === "1") return fakeProvider();
  const cfg = await resolveEwelinkConfig();
  if (!cfg) return null;
  return ewelinkProvider(cfg);
}
