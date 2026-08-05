import "dotenv/config";
import bcrypt from "bcryptjs";
import { db } from "../src/lib/db";

async function seedAccounts() {
  const passwordHash = await bcrypt.hash("password123", 10);

  const users: { email: string; role: "admin" | "customer" | "inspection" | "socmgr" }[] = [
    { email: "admin@firsthing.local", role: "admin" },
    { email: "customer@firsthing.local", role: "customer" },
    { email: "inspector@firsthing.local", role: "inspection" },
    { email: "socmgr@firsthing.local", role: "socmgr" },
  ];

  for (const u of users) {
    await db.profile.upsert({
      where: { email: u.email },
      update: {},
      create: { ...u, passwordHash },
    });
  }

  // Personal admin login for manual testing (separate password from the
  // shared "password123" seeded accounts above).
  const yogeshPasswordHash = await bcrypt.hash("Test@12345", 10);
  await db.profile.upsert({
    where: { email: "yogesh@firsthing.earth" },
    update: {},
    create: { email: "yogesh@firsthing.earth", role: "admin", passwordHash: yogeshPasswordHash },
  });
}

const PDF_PLACEHOLDER = "https://example.com/sample-document.pdf";

/**
 * Synthetic societies/devices/tanks/invoices/reports/exceptions/tasks/metrics
 * so the dashboards have something to show besides empty states. Names and
 * figures are lifted straight from docs/design_handoff_firsthing_platform/'s
 * own mock data for visual continuity with the design reference. Skipped
 * entirely if any society already exists, so this is safe to re-run.
 */
async function seedSyntheticData() {
  if ((await db.society.count()) > 0) {
    console.log("Societies already exist — skipping synthetic data seed.");
    return;
  }

  const societyDefs = [
    { name: "Settlement Nexus, HSR Layout", city: "Bengaluru", status: "active" as const, totalLights: 184, savingsPercentage: 31, deviceCount: 14 },
    { name: "ASF Insignia, Gurugram", city: "Gurugram", status: "active" as const, totalLights: 320, savingsPercentage: 24, deviceCount: 12 },
    { name: "Brigade Cornerstone, Whitefield", city: "Bengaluru", status: "active" as const, totalLights: 96, savingsPercentage: 29, deviceCount: 9 },
    { name: "Settlement Vega, Koramangala", city: "Bengaluru", status: "active" as const, totalLights: 128, savingsPercentage: 18, deviceCount: 11 },
    { name: "Prestige Ferns, Haralur", city: "Bengaluru", status: "onboarding" as const, totalLights: 0, savingsPercentage: 0, deviceCount: 0 },
  ];

  const societies = [];
  for (const s of societyDefs) {
    const society = await db.society.create({
      data: {
        name: s.name,
        city: s.city,
        state: "Karnataka",
        status: s.status,
        totalLights: s.totalLights,
        savingsPercentage: s.savingsPercentage,
        contactPerson: "Facilities Manager",
        contactPhone: "+91-9800000000",
      },
    });
    societies.push({ ...s, id: society.id });
  }
  const [nexus, insignia, cornerstone, vega, ferns] = societies;
  const activeSocieties = [nexus, insignia, cornerstone, vega];

  // Link the seeded customer test account to a real society.
  await db.profile.update({
    where: { email: "customer@firsthing.local" },
    data: { societyId: nexus.id, societyName: nexus.name },
  });
  const inspector = await db.profile.findUniqueOrThrow({ where: { email: "inspector@firsthing.local" } });

  // Devices — deterministic ~1-in-12 offline, matching the design's ~92% feed health.
  for (const s of activeSocieties) {
    const codePrefix = s.name.split(",")[0].replace(/[^A-Z]/gi, "").slice(0, 3).toUpperCase();
    for (let i = 0; i < s.deviceCount; i++) {
      await db.device.create({
        data: {
          societyId: s.id,
          societyName: s.name,
          deviceName: `Meter ${codePrefix}-${String(i + 1).padStart(4, "0")}`,
          deviceType: "Smart Meter",
          status: i % 12 === 0 ? "Offline" : "Online",
          lastSeen: new Date(),
        },
      });
    }
  }

  // Tanks + latest readings for the first two active societies.
  const tankSocieties = [
    { society: nexus, tankName: "Overhead Tank A", level: 62, status: "healthy" as const },
    { society: insignia, tankName: "Overhead Tank B", level: 48, status: "medium" as const },
  ];
  for (const t of tankSocieties) {
    const tank = await db.tankConfiguration.create({
      data: {
        societyId: t.society.id,
        tankName: t.tankName,
        tankCode: `TC-${t.society.id}`,
        tankType: "Overhead Tank",
        location: "Terrace",
        capacityLiters: 50_000,
        heightMeters: 6,
        sensorOffsetCm: 15,
      },
    });
    await db.tankReading.create({
      data: {
        tankId: tank.id,
        waterLevelPercent: t.level,
        currentLiters: (t.level / 100) * 50_000,
        sensorDistanceCm: 450,
        status: t.status,
      },
    });
  }

  // Invoices — a mix of statuses across active societies.
  const invoiceStatuses = ["Paid", "Due", "Overdue", "Issued"] as const;
  for (const [idx, s] of activeSocieties.entries()) {
    const status = invoiceStatuses[idx % invoiceStatuses.length];
    const amount = 40_000 + idx * 5_000;
    const gst = Math.round(amount * 0.18);
    await db.invoice.create({
      data: {
        societyId: s.id,
        societyName: s.name,
        invoiceNumber: `INV-2026-0${idx + 1}`,
        invoiceMonth: "July 2026",
        amount,
        gst,
        totalAmount: amount + gst,
        dueDate: new Date(Date.UTC(2026, 6, 15 + idx * 7)),
        status,
        pdfUrl: PDF_PLACEHOLDER,
      },
    });
  }

  // Savings reports for the first two active societies.
  for (const s of [nexus, insignia]) {
    await db.savingsReport.create({
      data: { societyId: s.id, reportMonth: "July 2026", pdfUrl: PDF_PLACEHOLDER },
    });
  }

  // Field inspection (created by the inspector account) + its checklist items.
  const inspection = await db.inspectionForm.create({
    data: {
      societyId: cornerstone.id,
      societyName: cornerstone.name,
      area: "Basement parking",
      inspectionDate: new Date(Date.UTC(2026, 6, 28)),
      inspectorName: "S. Kulkarni",
      contactNumber: "+91-9800000001",
      totalLightsChecked: 42,
      faultyLights: 3,
      createdBy: inspector.id,
    },
  });
  await db.inspectionFormItem.createMany({
    data: [
      { inspectionFormId: inspection.id, location: "B1 - Aisle 3", issueType: "Flickering", remarks: "Ballast likely failing" },
      { inspectionFormId: inspection.id, location: "B2 - Ramp", issueType: "Not working", remarks: "Replaced fixture" },
      { inspectionFormId: inspection.id, location: "B2 - Exit stairwell", issueType: "Not working", remarks: "Awaiting part" },
    ],
  });

  // Admin-uploaded inspection report PDF.
  await db.inspectionReport.create({
    data: { societyId: vega.id, reportType: "Pump Inspection", reportDate: new Date(Date.UTC(2026, 6, 20)), pdfUrl: PDF_PLACEHOLDER },
  });

  // Exceptions — reusing the design handoff's own mock rows, mostly unresolved.
  await db.exception.createMany({
    data: [
      { societyId: nexus.id, severity: "high", title: "Meter MTR-0142 offline", category: "DG feed", openedAt: hoursAgo(3) },
      { societyId: insignia.id, severity: "medium", title: "Missing 14 intervals", category: "Chiller circuit", openedAt: hoursAgo(6) },
      { societyId: cornerstone.id, severity: "medium", title: "July savings report unpublished", category: "Draft since 28 Jul", openedAt: daysAgo(2) },
      { societyId: cornerstone.id, severity: "high", title: "Inspection INSP-2477 no evidence", category: "Missing mandatory photo", openedAt: daysAgo(1) },
      { societyId: insignia.id, severity: "critical", title: "Tank T-07 critical", category: "Escalated to society manager", openedAt: minutesAgo(52) },
    ],
  });

  // Pending tasks — same source.
  await db.task.createMany({
    data: [
      { societyId: cornerstone.id, type: "APPROVE", title: "July savings report · Settlement Nexus HSR", assignee: "A. Rao", dueAt: hoursFromNow(8), status: "open" },
      { societyId: vega.id, type: "PUBLISH", title: "Inspection report INSP-2468", assignee: "S. Kulkarni", dueAt: hoursFromNow(2), status: "open" },
      { societyId: insignia.id, type: "INGEST", title: "Re-run failed ingestion batch #8841", assignee: null, dueAt: hoursFromNow(6), status: "open" },
      { societyId: cornerstone.id, type: "CONTRACT", title: "Service agreement expiring", assignee: null, dueAt: daysFromNow(22), status: "open" },
      { societyId: null, type: "ASSIGN", title: "3 unassigned inspection tasks", assignee: null, dueAt: hoursFromNow(20), status: "open" },
    ],
  });

  // Monthly society metrics for the last 4 months, mostly for the Portfolio
  // dashboard's savings-vs-baseline chart (metered vs extrapolated split).
  for (let m = 0; m < 4; m++) {
    const month = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() - m, 1));
    const monthlyGrowth = 1 + (3 - m) * 0.06; // slight upward trend into the current month
    for (const [idx, s] of activeSocieties.entries()) {
      const baseline = (8000 + idx * 1500) * monthlyGrowth;
      const actual = baseline * 0.7;
      await db.monthlySocietyMetric.create({
        data: {
          societyId: s.id,
          month,
          baselineKwh: baseline,
          actualKwh: actual,
          energyAvoidedKwh: baseline - actual,
          co2AvoidedKg: (baseline - actual) * 0.71,
          billSavingInr: (baseline - actual) * 7.5,
          isVerifiedMetered: idx % 2 === 0,
        },
      });
    }
  }

  // Prestige Ferns stays onboarding with nothing else attached — matches the
  // design's own "onboarding · step 3 of 6" example.
  void ferns;
}

function minutesAgo(n: number) {
  return new Date(Date.now() - n * 60_000);
}
function hoursAgo(n: number) {
  return new Date(Date.now() - n * 3_600_000);
}
function daysAgo(n: number) {
  return new Date(Date.now() - n * 86_400_000);
}
function hoursFromNow(n: number) {
  return new Date(Date.now() + n * 3_600_000);
}
function daysFromNow(n: number) {
  return new Date(Date.now() + n * 86_400_000);
}

async function main() {
  await seedAccounts();
  await seedSyntheticData();
}

main()
  .then(() => db.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await db.$disconnect();
    process.exit(1);
  });
