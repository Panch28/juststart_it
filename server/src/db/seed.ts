/**
 * Seeds the database with a realistic, self-consistent set of fictional
 * university data. All names, institutions and records are fictional.
 *
 * Usage:
 *   npm run seed          – create the schema and insert demo data (idempotent)
 *   npm run reset-db      – delete the database file and re-seed from scratch
 */
import { db, applySchema, DB_PATH, nowIso, today, addDays } from './connection.js';
import { hashPassword } from '../lib/crypto.js';
import { generateDeadlineNotifications } from '../lib/notifications.js';

const RESET = process.argv.includes('--reset');
const DEMO_PASSWORD = 'demo1234';

/**
 * Drops every table so the database can be rebuilt. Dropping tables in SQL
 * (rather than deleting the file) works on platforms that lock open files.
 */
function dropAllTables(): void {
  db.exec('PRAGMA foreign_keys = OFF;');
  const tables = db
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`)
    .all() as any[];
  for (const t of tables) {
    db.exec(`DROP TABLE IF EXISTS "${t.name}"`);
  }
  db.exec('PRAGMA foreign_keys = ON;');
  console.log(`Dropped ${tables.length} existing table(s) from ${DB_PATH}`);
}

if (RESET) {
  dropAllTables();
}

applySchema();

const already = (db.prepare('SELECT COUNT(*) AS c FROM users').get() as any).c as number;
if (already > 0 && !RESET) {
  console.log(`Database already contains ${already} users. Use "npm run reset-db" to rebuild from scratch.`);
  process.exit(0);
}

const PASSWORD = hashPassword(DEMO_PASSWORD);
const iso = (daysFromToday: number): string => addDays(today(), daysFromToday);

function insertUser(fullName: string, email: string, role: string, departmentId: number | null, designation: string, phone: string) {
  const result = db
    .prepare(
      `INSERT INTO users (full_name, email, password_hash, role, department_id, designation, phone, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?)`,
    )
    .run(fullName, email, PASSWORD, role, departmentId, designation, phone, nowIso(), nowIso());
  return Number(result.lastInsertRowid);
}

// ------------------------------------------------------------- departments
const departmentDefs = [
  ['BIOT', 'Biotechnology'],
  ['ENVS', 'Environmental Science'],
  ['CSAI', 'Computer Science & Artificial Intelligence'],
  ['MATS', 'Materials Science'],
  ['REEN', 'Renewable Energy Systems'],
  ['HLTH', 'Health Sciences'],
  ['AGRI', 'Agricultural Technology'],
];
for (const [code, name] of departmentDefs) {
  db.prepare('INSERT INTO departments (code, name, created_at, updated_at) VALUES (?, ?, ?, ?)').run(
    code,
    name,
    nowIso(),
    nowIso(),
  );
}
const dept = (code: string): number =>
  (db.prepare('SELECT id FROM departments WHERE code = ?').get(code) as any).id as number;

const D_BIO = dept('BIOT');
const D_ENV = dept('ENVS');
const D_CSAI = dept('CSAI');
const D_MAT = dept('MATS');
const D_REEN = dept('REEN');
const D_HEALTH = dept('HLTH');
const D_AGRI = dept('AGRI');

// ------------------------------------------------------------------ users
const admin = insertUser('Dr. Harini Raghavan', 'admin@northgate.edu', 'ADMINISTRATOR', null, 'Director, Research & Innovation', '+1 555 0100');

const researcherDefs: Array<[string, string, number, string]> = [
  ['Dr. Vikram Shah', 'vikram.shah@northgate.edu', D_BIO, 'Professor & Head of Department'],
  ['Dr. Elena Marsh', 'elena.marsh@northgate.edu', D_BIO, 'Associate Professor'],
  ['Dr. Samuel Okafor', 'samuel.okafor@northgate.edu', D_ENV, 'Professor & Head of Department'],
  ['Dr. Priya Nandakumar', 'priya.nandakumar@northgate.edu', D_CSAI, 'Professor'],
  ['Dr. Thomas Lindqvist', 'thomas.lindqvist@northgate.edu', D_CSAI, 'Associate Professor'],
  ['Dr. Amara Bello', 'amara.bello@northgate.edu', D_MAT, 'Professor & Head of Department'],
  ['Dr. Rahul Mehta', 'rahul.mehta@northgate.edu', D_REEN, 'Assistant Professor'],
  ['Dr. Sofia Alvarez', 'sofia.alvarez@northgate.edu', D_HEALTH, 'Professor'],
  ['Dr. Nadia Karim', 'nadia.karim@northgate.edu', D_AGRI, 'Associate Professor'],
  ['Dr. Julian Hart', 'julian.hart@northgate.edu', D_ENV, 'Assistant Professor'],
  ['Dr. Mei Chen', 'mei.chen@northgate.edu', D_CSAI, 'Research Fellow'],
];
const researchers = researcherDefs.map(([name, email, deptId, desig]) =>
  insertUser(name, email, 'RESEARCHER', deptId, desig, '+1 555 0101'),
);

const iprOfficer = insertUser('Dr. Farah Siddiqui', 'farah.siddiqui@northgate.edu', 'IPR_OFFICER', null, 'IPR Officer', '+1 555 0102');
const iprOfficer2 = insertUser('Ravi Deshmukh', 'ravi.deshmukh@northgate.edu', 'IPR_OFFICER', null, 'Deputy IPR Officer', '+1 555 0103');

const committeeDefs: Array<[string, string, string]> = [
  ['Dr. Owen Whitfield', 'owen.whitfield@northgate.edu', 'Chair, Research Ethics Committee'],
  ['Dr. Lena Fischer', 'lena.fischer@northgate.edu', 'Member, Research Ethics Committee'],
  ['Prof. Daniel Okoye', 'daniel.okoye@northgate.edu', 'Member, Funding Assessment Panel'],
];
const committee = committeeDefs.map(([name, email, desig]) => insertUser(name, email, 'APPROVAL_MEMBER', null, desig, '+1 555 0104'));

const incubationManager = insertUser('Priya Venkatesan', 'priya.venkatesan@northgate.edu', 'INCUBATION_MANAGER', null, 'Head, Startup Incubation Cell', '+1 555 0105');
const incubationManager2 = insertUser('Arjun Kapoor', 'arjun.kapoor@northgate.edu', 'INCUBATION_MANAGER', null, 'Incubation Programme Officer', '+1 555 0106');

const mentorDefs: Array<[string, string, number, string, string, string]> = [
  ['Dr. Isabel Moreno', 'isabel.moreno@northgate.edu', D_BIO, 'Bioprocess engineering, scale-up', 'Biotechnology, Clean energy', 'Former R&D lead in industrial enzyme manufacturing. Advises on pilot-scale process transfer.'],
  ['Dr. Kenji Watanabe', 'kenji.watanabe@northgate.edu', D_CSAI, 'Applied machine learning, MLOps', 'Software, Data services', 'Leads the applied ML group and has supervised twelve student ventures through incubation.'],
  ['Dr. Yusuf Demir', 'yusuf.demir@northgate.edu', D_REEN, 'Grid integration, storage', 'Renewable energy, Manufacturing', 'Consultant for three grid operators; focus on storage and dispatch modelling.'],
  ['Dr. Clara Nowak', 'clara.nowak@northgate.edu', D_MAT, 'Materials characterisation, composites', 'Manufacturing, Aerospace', 'Materials scientist with a strong commercialisation track record.'],
];
const mentors = mentorDefs.map(([name, email, deptId, expertise, industries, bio]) => {
  const uid = insertUser(name, email, 'MENTOR', deptId, 'Mentor', '+1 555 0107');
  db.prepare(
    `INSERT INTO mentors (user_id, expertise, industries, bio, max_startups, status, created_at)
     VALUES (?, ?, ?, ?, ?, 'ACTIVE', ?)`,
  ).run(uid, expertise, industries, bio, 3, nowIso());
  return { id: (db.prepare('SELECT id FROM mentors WHERE user_id = ?').get(uid) as any).id, userId: uid };
});

// ------------------------------------------------------- research projects
interface ProjectDef {
  code: string;
  title: string;
  description: string;
  domain: string;
  category: string;
  departmentId: number;
  pi: number;
  startDate: string;
  completionDate: string;
  funding: number;
  objectives: string;
  outcomes: string;
  status: string;
  progress: number;
  submittedOffset: number | null;
  approvedOffset: number | null;
  completedOffset: number | null;
  team: Array<[number, string, string]>;
}

const projectDefs: ProjectDef[] = [
  {
    code: 'RP-1001',
    title: 'CRISPR-Cas9 Mediated Enhancement of Drought Tolerance in Millet',
    description:
      'This project investigates the use of CRISPR-Cas9 gene editing to introduce sub1A and DREB alleles into three locally adapted millet varieties, targeting a 30% improvement in yield under simulated drought conditions.',
    domain: 'Biotechnology',
    category: 'Applied Research',
    departmentId: D_BIO,
    pi: researchers[0],
    startDate: iso(-210),
    completionDate: iso(150),
    funding: 1850000,
    objectives:
      'Isolate and validate drought-tolerance alleles; establish a CRISPR transformation protocol for millet; run replicated field trials across two seasons.',
    outcomes:
      'Validated transformation protocol, three edited varieties and a peer-reviewed characterisation of field performance.',
    status: 'ACTIVE',
    progress: 62,
    submittedOffset: -240,
    approvedOffset: -225,
    completedOffset: null,
    team: [
      [researchers[1], 'Genome editing and transformation', 'Dr. Elena Marsh'],
      [researchers[8], 'Field trial design and phenotyping', 'Dr. Nadia Karim'],
    ],
  },
  {
    code: 'RP-1002',
    title: 'Low-Cost Sensor Network for Urban Air Quality Monitoring',
    description:
      'Design and pilot a distributed low-cost sensor network across six municipal zones, combining particulate, nitrogen dioxide and humidity sensing with a calibration protocol against reference instruments.',
    domain: 'Environmental Science',
    category: 'Interdisciplinary',
    departmentId: D_ENV,
    pi: researchers[2],
    startDate: iso(-120),
    completionDate: iso(240),
    funding: 940000,
    objectives:
      'Produce a calibrated low-cost sensor platform; deploy it across six zones; publish the dataset with a documented calibration methodology.',
    outcomes: 'Open sensor dataset, calibration protocol and a municipal pilot deployment report.',
    status: 'ACTIVE',
    progress: 41,
    submittedOffset: -150,
    approvedOffset: -132,
    completedOffset: null,
    team: [[researchers[9], 'Sensor electronics and firmware', 'Dr. Julian Hart']],
  },
  {
    code: 'RP-1003',
    title: 'Explainable Machine Learning for Early Detection of Crop Disease',
    description:
      'Developing an explainable deep learning pipeline that identifies early signs of leaf blight and rust from field imagery, with attention-based attribution maps that agronomists can interpret.',
    domain: 'Artificial Intelligence',
    category: 'Applied Research',
    departmentId: D_CSAI,
    pi: researchers[3],
    startDate: iso(-180),
    completionDate: iso(30),
    funding: 1250000,
    objectives:
      'Assemble a labelled field image dataset of 40,000 samples; benchmark three explainable architectures; validate explanations with agronomist review.',
    outcomes: 'Released dataset, benchmarked model family and an interpretation protocol co-signed by agronomists.',
    status: 'ACTIVE',
    progress: 88,
    submittedOffset: -200,
    approvedOffset: -185,
    completedOffset: null,
    team: [
      [researchers[4], 'Model architecture and evaluation', 'Dr. Thomas Lindqvist'],
      [researchers[10], 'Dataset curation and annotation', 'Dr. Mei Chen'],
    ],
  },
  {
    code: 'RP-1004',
    title: 'Recycled Carbon Fibre Reinforced Polymer Composites for Lightweight Structures',
    description:
      'Characterising the mechanical performance and fatigue behaviour of thermoplastic composites reinforced with reclaimed carbon fibre, targeting structural components that currently rely on virgin fibre.',
    domain: 'Materials Science',
    category: 'Industrial Research',
    departmentId: D_MAT,
    pi: researchers[5],
    startDate: iso(-300),
    completionDate: iso(-20),
    funding: 2140000,
    objectives:
      'Quantify fibre recovery efficiency; measure tensile and fatigue properties; deliver a process window for structural-grade parts.',
    outcomes: 'Characterisation dataset, process window documentation and a technical data sheet for partners.',
    status: 'COMPLETED',
    progress: 100,
    submittedOffset: -330,
    approvedOffset: -318,
    completedOffset: -22,
    team: [[researchers[6], 'Fatigue test programme', 'Dr. Rahul Mehta']],
  },
  {
    code: 'RP-1005',
    title: 'Seasonal Thermal Energy Storage Using Phase Change Materials',
    description:
      'Investigating a modular phase change storage unit suitable for district heating networks, focusing on cycle stability over ten years of simulated operation.',
    domain: 'Renewable Energy',
    category: 'Basic Research',
    departmentId: D_REEN,
    pi: researchers[6],
    startDate: iso(-90),
    completionDate: iso(275),
    funding: 1680000,
    objectives:
      'Screen candidate phase change materials; build a 2 kWh prototype; run accelerated cycling to model ten-year performance.',
    outcomes: 'Material screening report, prototype build and an accelerated cycling dataset.',
    status: 'APPROVED',
    progress: 12,
    submittedOffset: -110,
    approvedOffset: -75,
    completedOffset: null,
    team: [],
  },
  {
    code: 'RP-1006',
    title: 'Wearable Biosensor for Continuous Glucose and Lactate Tracking',
    description:
      'Designing a flexible epidermal biosensor capable of simultaneous glucose and lactate measurement over a seven-day wear period in ambulatory human volunteers.',
    domain: 'Health Sciences',
    category: 'Clinical Research',
    departmentId: D_HEALTH,
    pi: researchers[7],
    startDate: iso(-60),
    completionDate: iso(300),
    funding: 1420000,
    objectives:
      'Fabricate the sensor and reference electrodes; complete an institutional ethics review; run a volunteer study with clinical supervision.',
    outcomes: 'Validated sensor platform, an ethics-approved protocol and clinical validation results.',
    status: 'UNDER_REVIEW',
    progress: 8,
    submittedOffset: -14,
    approvedOffset: null,
    completedOffset: null,
    team: [[researchers[5], 'Electrode materials', 'Dr. Amara Bello']],
  },
  {
    code: 'RP-1007',
    title: 'Microbial Biofertiliser for Drought-Resilient Pulses',
    description:
      'Isolating drought-tolerant rhizobacteria from arid soils and evaluating a consortium biofertiliser for improved water-use efficiency in chickpea and pigeonpea.',
    domain: 'Agricultural Technology',
    category: 'Applied Research',
    departmentId: D_AGRI,
    pi: researchers[8],
    startDate: iso(-160),
    completionDate: iso(120),
    funding: 760000,
    objectives:
      'Isolate and characterise candidate strains; screen for plant growth promotion; run a two-season field trial.',
    outcomes: 'Strain collection, a formulated consortium product specification and trial results.',
    status: 'ACTIVE',
    progress: 55,
    submittedOffset: -190,
    approvedOffset: -175,
    completedOffset: null,
    team: [],
  },
  {
    code: 'RP-1008',
    title: 'Hydrogen Electrolyser Efficiency Under Variable Renewable Input',
    description:
      'Characterising a 2 kW alkaline electrolyser under simulated wind and solar intermittency to quantify degradation and round-trip efficiency losses.',
    domain: 'Renewable Energy',
    category: 'Industrial Research',
    departmentId: D_REEN,
    pi: researchers[6],
    startDate: iso(-45),
    completionDate: iso(120),
    funding: 1120000,
    objectives:
      'Build a variable-input test rig; run 500 hour endurance profiles; publish degradation coefficients.',
    outcomes: 'Endurance dataset, degradation model and a commissioning protocol for renewable-coupled sites.',
    status: 'SUBMITTED',
    progress: 0,
    submittedOffset: -9,
    approvedOffset: null,
    completedOffset: null,
    team: [],
  },
  {
    code: 'RP-1009',
    title: 'Community-Level Water Quality Surveillance Framework',
    description:
      'Co-designing a water quality surveillance framework with three municipal partners, combining community sampling with laboratory confirmation for nitrate and microbial indicators.',
    domain: 'Environmental Science',
    category: 'Developmental Research',
    departmentId: D_ENV,
    pi: researchers[9],
    startDate: iso(-20),
    completionDate: iso(340),
    funding: 480000,
    objectives:
      'Map community sampling sites; train community samplers; establish a laboratory confirmation chain.',
    outcomes: 'Surveillance protocol, a trained community network and a shared regional baseline dataset.',
    status: 'SUBMITTED',
    progress: 0,
    submittedOffset: -6,
    approvedOffset: null,
    completedOffset: null,
    team: [],
  },
  {
    code: 'RP-1010',
    title: 'Federated Learning Across Regional Hospital Networks',
    description:
      'Assessing federated learning across four partner hospitals for predicting deterioration in emergency admissions without moving patient data between institutions.',
    domain: 'Artificial Intelligence',
    category: 'Interdisciplinary',
    departmentId: D_CSAI,
    pi: researchers[4],
    startDate: iso(0),
    completionDate: iso(365),
    funding: 1780000,
    objectives:
      'Agree a common federated protocol with four hospitals; implement a reference framework; benchmark against a centralised baseline.',
    outcomes: 'Federated reference implementation, a governance protocol and comparative benchmark results.',
    status: 'DRAFT',
    progress: 0,
    submittedOffset: null,
    approvedOffset: null,
    completedOffset: null,
    team: [[researchers[7], 'Clinical validation and data governance', 'Dr. Sofia Alvarez']],
  },
  {
    code: 'RP-1011',
    title: 'Ultrasonically Welded Recyclable Multilayer Films',
    description:
      'Developing welding parameters and barrier coatings for recyclable multilayer packaging films that currently rely on non-recyclable adhesives.',
    domain: 'Materials Science',
    category: 'Developmental Research',
    departmentId: D_MAT,
    pi: researchers[5],
    startDate: iso(-35),
    completionDate: iso(200),
    funding: 890000,
    objectives:
      'Characterise weld strength across film combinations; develop a compliant barrier coating; validate with a packaging converter.',
    outcomes: 'Welding process window, coated film prototypes and converter validation results.',
    status: 'UNDER_REVIEW',
    progress: 5,
    submittedOffset: -18,
    approvedOffset: null,
    completedOffset: null,
    team: [],
  },
  {
    code: 'RP-1012',
    title: 'Antimicrobial Peptides for Post-Harvest Grain Preservation',
    description:
      'Screening a library of designed antimicrobial peptides against post-harvest fungal pathogens, with a focus on shelf-life extension without residue concerns.',
    domain: 'Biotechnology',
    category: 'Basic Research',
    departmentId: D_BIO,
    pi: researchers[1],
    startDate: iso(-400),
    completionDate: iso(-10),
    funding: 620000,
    objectives:
      'Screen 120 peptide candidates; confirm activity against three pathogens; run a pilot grain storage trial.',
    outcomes: 'Screening dataset, lead candidates and pilot storage trial results.',
    status: 'COMPLETED',
    progress: 100,
    submittedOffset: -420,
    approvedOffset: -405,
    completedOffset: -12,
    team: [],
  },
  {
    code: 'RP-1013',
    title: 'Precision Irrigation Scheduling from Soil Moisture Telemetry',
    description:
      'Using a distributed soil moisture telemetry network with a deficit irrigation model to reduce water use in tomato and cotton without yield loss.',
    domain: 'Agricultural Technology',
    category: 'Applied Research',
    departmentId: D_AGRI,
    pi: researchers[8],
    startDate: iso(-70),
    completionDate: iso(150),
    funding: 1050000,
    objectives:
      'Deploy telemetry nodes across two blocks; calibrate the deficit model; compare against farmer practice.',
    outcomes: 'Telemetry dataset, calibrated scheduling model and a water-use comparison report.',
    status: 'ACTIVE',
    progress: 34,
    submittedOffset: -95,
    approvedOffset: -80,
    completedOffset: null,
    team: [[researchers[9], 'Field instrumentation', 'Dr. Julian Hart']],
  },
  {
    code: 'RP-1014',
    title: 'Closed-Loop Recovery of Rare Earth Elements from Industrial Effluent',
    description:
      'Developing a low-pH solvent extraction process for recovering neodymium and dysprosium from industrial wastewater, with a focus on reagent recycling.',
    domain: 'Environmental Science',
    category: 'Industrial Research',
    departmentId: D_ENV,
    pi: researchers[2],
    startDate: iso(-25),
    completionDate: iso(320),
    funding: 1330000,
    objectives:
      'Characterise effluent streams; benchmark two extractants; demonstrate a closed reagent loop at bench scale.',
    outcomes: 'Extraction benchmarks, a bench-scale closed-loop demonstration and a technoeconomic note.',
    status: 'RETURNED_FOR_CORRECTION',
    progress: 3,
    submittedOffset: -30,
    approvedOffset: null,
    completedOffset: null,
    team: [],
  },
];

const projectIds: Record<string, number> = {};
for (const p of projectDefs) {
  const result = db
    .prepare(
      `INSERT INTO research_projects
        (project_code, title, description, domain, category, department_id, principal_investigator_id,
         start_date, expected_completion_date, funding_required, objectives, expected_outcomes,
         status, progress, submitted_at, approved_at, completed_at, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      p.code,
      p.title,
      p.description,
      p.domain,
      p.category,
      p.departmentId,
      p.pi,
      p.startDate,
      p.completionDate,
      p.funding,
      p.objectives,
      p.outcomes,
      p.status,
      p.progress,
      p.submittedOffset !== null ? iso(p.submittedOffset) : null,
      p.approvedOffset !== null ? iso(p.approvedOffset) : null,
      p.completedOffset !== null ? iso(p.completedOffset) : null,
      p.pi,
      iso(p.submittedOffset !== null ? p.submittedOffset : -30),
      nowIso(),
    );
  const id = Number(result.lastInsertRowid);
  projectIds[p.code] = id;

  for (const [userId, contribution] of p.team) {
    const user = db.prepare('SELECT full_name, email FROM users WHERE id = ?').get(userId) as any;
    db.prepare(
      `INSERT INTO research_team_members (project_id, user_id, name, email, member_role, contribution)
       VALUES (?, ?, ?, ?, 'CO_INVESTIGATOR', ?)`,
    ).run(id, userId, user.full_name, user.email, contribution);
  }
}

// ------------------------------------------------------- project milestones
const milestoneDefs: Array<[string, string, number, string, number, string]> = [
  ['RP-1001', 'Allele isolation and validation complete', -120, 'COMPLETED', 100, 'Three alleles validated in the glasshouse.'],
  ['RP-1001', 'Transformation protocol established', -30, 'COMPLETED', 100, 'Protocol documented for two millet varieties.'],
  ['RP-1001', 'Season one field trial', 60, 'IN_PROGRESS', 45, 'Field plots established at two sites.'],
  ['RP-1001', 'Season two field trial and analysis', 140, 'PENDING', 0, 'Dependent on season one harvest.'],
  ['RP-1002', 'Sensor platform revision C', -70, 'COMPLETED', 100, 'Calibration error within target band.'],
  ['RP-1002', 'Six-zone deployment', 20, 'IN_PROGRESS', 55, 'Four of six zones online.'],
  ['RP-1002', 'Dataset publication', 200, 'PENDING', 0, ''],
  ['RP-1003', 'Dataset curation', -120, 'COMPLETED', 100, '40,000 labelled images.'],
  ['RP-1003', 'Benchmark study', -25, 'COMPLETED', 100, 'Attention-anchored model best performing.'],
  ['RP-1003', 'Agronomist validation sessions', 20, 'IN_PROGRESS', 60, 'Four of six sessions complete.'],
  ['RP-1005', 'Material screening campaign', 30, 'PENDING', 0, ''],
  ['RP-1006', 'Ethics committee submission', -10, 'IN_PROGRESS', 70, 'Awaiting committee scheduling.'],
  ['RP-1007', 'Strain isolation and characterisation', -60, 'COMPLETED', 100, 'Six candidate strains identified.'],
  ['RP-1007', 'Greenhouse screening', 10, 'IN_PROGRESS', 65, ''],
  ['RP-1007', 'Two-season field trial', 110, 'PENDING', 0, ''],
  ['RP-1013', 'Telemetry node deployment', -20, 'COMPLETED', 100, '32 nodes installed across two blocks.'],
  ['RP-1013', 'Deficit model calibration', 40, 'IN_PROGRESS', 35, ''],
  ['RP-1004', 'Deliverable pack and handover', -25, 'COMPLETED', 100, 'Technical data sheet issued to partners.'],
];
for (const [code, title, dueOffset, status, progress, notes] of milestoneDefs) {
  db.prepare(
    `INSERT INTO project_milestones (project_id, title, description, due_date, status, progress, notes, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(projectIds[code], title, '', iso(dueOffset), status, progress, notes, nowIso(), nowIso());
}

// ------------------------------------------------------------- IPR records
const iprDefs: Array<{
  code: string;
  project: string | null;
  title: string;
  type: string;
  description: string;
  disclosureOffset: number | null;
  filingOffset: number | null;
  deadlineOffset: number | null;
  status: string;
  officer: number;
  inventors: number[];
}> = [
  {
    code: 'IPR-501',
    project: 'RP-1001',
    title: 'Method for Drought-Tolerance Editing in Millet Using CRISPR-Cas9',
    type: 'PATENT',
    description:
      'Covers the transformation protocol developed for introducing sub1A alleles into locally adapted millet varieties, together with the selection regime used to recover edited lines.',
    disclosureOffset: -190,
    filingOffset: -120,
    deadlineOffset: 18,
    status: 'FILED',
    officer: iprOfficer,
    inventors: [researchers[0], researchers[1]],
  },
  {
    code: 'IPR-502',
    project: 'RP-1002',
    title: 'Calibration Method for Low-Cost Particulate Sensors in Urban Networks',
    type: 'PATENT',
    description:
      'Describes the co-location calibration procedure that corrects systematic drift in consumer-grade particulate sensors across a distributed monitoring network.',
    disclosureOffset: -80,
    filingOffset: null,
    deadlineOffset: 42,
    status: 'APPROVED_FOR_FILING',
    officer: iprOfficer,
    inventors: [researchers[2], researchers[9]],
  },
  {
    code: 'IPR-503',
    project: 'RP-1003',
    title: 'Attention Attribution Map for Plant Disease Classification',
    type: 'PATENT',
    description:
      'A method for generating region-level attribution maps on field imagery that surface agronomically meaningful lesion features for early blight and rust detection.',
    disclosureOffset: -60,
    filingOffset: null,
    deadlineOffset: 6,
    status: 'UNDER_EVALUATION',
    officer: iprOfficer2,
    inventors: [researchers[3], researchers[4]],
  },
  {
    code: 'IPR-504',
    project: 'RP-1004',
    title: 'Recycled Carbon Fibre Reinforced Thermoplastic Composite',
    type: 'PATENT',
    description:
      'Claims the recycled carbon fibre surface treatment and resin impregnation route that retains structural-grade mechanical performance.',
    disclosureOffset: -290,
    filingOffset: -240,
    deadlineOffset: 75,
    status: 'UNDER_EXAMINATION',
    officer: iprOfficer,
    inventors: [researchers[5]],
  },
  {
    code: 'IPR-505',
    project: 'RP-1007',
    title: 'Rhizobacterial Consortium for Water-Use Efficiency in Pulses',
    type: 'PATENT',
    description:
      'A defined microbial consortium and its deployment method for improving water-use efficiency in chickpea and pigeonpea under deficit irrigation.',
    disclosureOffset: -150,
    filingOffset: null,
    deadlineOffset: 3,
    status: 'APPROVED_FOR_FILING',
    officer: iprOfficer2,
    inventors: [researchers[8]],
  },
  {
    code: 'IPR-506',
    project: null,
    title: 'Northgate Field Sensor Housing Assembly',
    type: 'UTILITY_MODEL',
    description: 'Protective enclosure design for field-deployed telemetry nodes used in the precision irrigation programme.',
    disclosureOffset: -50,
    filingOffset: -35,
    deadlineOffset: 90,
    status: 'FILED',
    officer: iprOfficer,
    inventors: [researchers[9]],
  },
  {
    code: 'IPR-507',
    project: 'RP-1012',
    title: 'Designed Antimicrobial Peptide Library and Screening Protocol',
    type: 'PATENT',
    description:
      'Covers the peptide library design space and the screening protocol used to identify candidates active against post-harvest fungal pathogens.',
    disclosureOffset: -380,
    filingOffset: -300,
    deadlineOffset: -8,
    status: 'FILED',
    officer: iprOfficer,
    inventors: [researchers[1]],
  },
  {
    code: 'IPR-508',
    project: 'RP-1006',
    title: 'Epidermal Multi-Analyte Biosensor Interface',
    type: 'PATENT',
    description:
      'Interface architecture allowing simultaneous glucose and lactate measurement on a flexible epidermal substrate for seven-day ambulatory wear.',
    disclosureOffset: -45,
    filingOffset: null,
    deadlineOffset: 25,
    status: 'DRAFT',
    officer: iprOfficer2,
    inventors: [researchers[7], researchers[5]],
  },
  {
    code: 'IPR-509',
    project: 'RP-1010',
    title: 'NGATE Open Course Materials — Federated Learning for Healthcare',
    type: 'COPYRIGHT',
    description:
      'Teaching materials and reference implementation released under an open licence for use in graduate federated learning programmes.',
    disclosureOffset: -20,
    filingOffset: -12,
    deadlineOffset: null,
    status: 'GRANTED',
    officer: iprOfficer,
    inventors: [researchers[4]],
  },
  {
    code: 'IPR-510',
    project: 'RP-1005',
    title: 'NGATE Phase Change Storage Module',
    type: 'TRADEMARK',
    description: 'Word and device mark proposed for the modular thermal storage unit developed with the district heating partner.',
    disclosureOffset: -60,
    filingOffset: null,
    deadlineOffset: 55,
    status: 'UNDER_EVALUATION',
    officer: iprOfficer2,
    inventors: [researchers[6]],
  },
];

const iprIds: Record<string, number> = {};
for (const r of iprDefs) {
  const type = ['PATENT', 'COPYRIGHT', 'TRADEMARK', 'OTHER'].includes(r.type) ? r.type : 'OTHER';
  const result = db
    .prepare(
      `INSERT INTO ipr_records
        (ipr_code, project_id, title, ipr_type, description, disclosure_date, filing_date,
         next_deadline, status, ipr_officer_id, notes, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '', ?, ?, ?)`,
    )
    .run(
      r.code,
      r.project ? projectIds[r.project] : null,
      r.title,
      type,
      r.description,
      r.disclosureOffset !== null ? iso(r.disclosureOffset) : null,
      r.filingOffset !== null ? iso(r.filingOffset) : null,
      r.deadlineOffset !== null ? iso(r.deadlineOffset) : null,
      r.status,
      r.officer,
      r.officer,
      nowIso(),
      nowIso(),
    );
  const id = Number(result.lastInsertRowid);
  iprIds[r.code] = id;
  for (const [idx, inv] of r.inventors.entries()) {
    const user = db.prepare('SELECT full_name, email FROM users WHERE id = ?').get(inv) as any;
    db.prepare(
      `INSERT INTO ipr_inventors (ipr_id, user_id, name, email, creator_order) VALUES (?, ?, ?, ?, ?)`,
    ).run(id, inv, user.full_name, user.email, idx + 1);
  }
}

// ------------------------------------------------------ approval requests
const approvalDefs: Array<{
  code: string;
  subjectType: string;
  subjectId: number;
  requestType: string;
  description: string;
  submittedBy: number;
  reviewer: number;
  stage: string;
  status: string;
  priority: string;
  submittedOffset: number;
  decidedOffset: number | null;
  comment: string;
}> = [
  {
    code: 'AR-2001',
    subjectType: 'PROJECT',
    subjectId: projectIds['RP-1008'],
    requestType: 'Research Project Approval',
    description: 'Hydrogen electrolyser endurance characterisation with a renewable-coupled test rig.',
    submittedBy: researchers[6],
    reviewer: committee[0],
    stage: 'Departmental Scrutiny',
    status: 'PENDING',
    priority: 'HIGH',
    submittedOffset: -9,
    decidedOffset: null,
    comment: 'Resubmitted after clarification of the test rig power envelope.',
  },
  {
    code: 'AR-2002',
    subjectType: 'PROJECT',
    subjectId: projectIds['RP-1006'],
    requestType: 'Research Project Approval',
    description: 'Wearable biosensor study involving human volunteers and continuous glucose monitoring.',
    submittedBy: researchers[7],
    reviewer: committee[0],
    stage: 'Ethics & Compliance Review',
    status: 'IN_REVIEW',
    priority: 'CRITICAL',
    submittedOffset: -14,
    decidedOffset: null,
    comment: 'Departmental scrutiny cleared. Ethics committee reviewing the volunteer protocol.',
  },
  {
    code: 'AR-2003',
    subjectType: 'PROJECT',
    subjectId: projectIds['RP-1011'],
    requestType: 'Research Project Approval',
    description: 'Ultrasonic welding of recyclable multilayer films with a converter partner.',
    submittedBy: researchers[5],
    reviewer: committee[1],
    stage: 'Departmental Scrutiny',
    status: 'PENDING',
    priority: 'NORMAL',
    submittedOffset: -18,
    decidedOffset: null,
    comment: 'Initial submission.',
  },
  {
    code: 'AR-2004',
    subjectType: 'PROJECT',
    subjectId: projectIds['RP-1009'],
    requestType: 'Research Project Approval',
    description: 'Community water quality surveillance framework with three municipal partners.',
    submittedBy: researchers[9],
    reviewer: committee[2],
    stage: 'Funding Assessment',
    status: 'PENDING',
    priority: 'NORMAL',
    submittedOffset: -6,
    decidedOffset: null,
    comment: 'Departmental scrutiny and ethics screening cleared.',
  },
  {
    code: 'AR-2005',
    subjectType: 'PROJECT',
    subjectId: projectIds['RP-1014'],
    requestType: 'Research Project Approval',
    description: 'Rare earth element recovery from industrial effluent.',
    submittedBy: researchers[2],
    reviewer: committee[0],
    stage: 'Departmental Scrutiny',
    status: 'RETURNED_FOR_CORRECTION',
    priority: 'NORMAL',
    submittedOffset: -30,
    decidedOffset: -16,
    comment: 'Please attach the reagent hazard assessment and clarify the effluent characterisation methodology before resubmission.',
  },
  {
    code: 'AR-2006',
    subjectType: 'PROJECT',
    subjectId: projectIds['RP-1003'],
    requestType: 'Research Project Approval',
    description: 'Explainable machine learning for crop disease detection.',
    submittedBy: researchers[3],
    reviewer: committee[0],
    stage: 'Final Approval',
    status: 'APPROVED',
    priority: 'HIGH',
    submittedOffset: -200,
    decidedOffset: -185,
    comment: 'Approved subject to a data-sharing agreement with the field stations.',
  },
  {
    code: 'AR-2007',
    subjectType: 'PROJECT',
    subjectId: projectIds['RP-1004'],
    requestType: 'Research Project Approval',
    description: 'Recycled carbon fibre composites for lightweight structures.',
    submittedBy: researchers[5],
    reviewer: committee[2],
    stage: 'Funding Assessment',
    status: 'APPROVED',
    priority: 'NORMAL',
    submittedOffset: -330,
    decidedOffset: -318,
    comment: 'Funding assessment panel approved the revised budget.',
  },
  {
    code: 'AR-2008',
    subjectType: 'IPR',
    subjectId: iprIds['IPR-503'],
    requestType: 'IPR Filing Authorisation',
    description: 'Authorisation to file the plant disease attribution map patent application.',
    submittedBy: iprOfficer2,
    reviewer: committee[1],
    stage: 'IPR Officer Evaluation',
    status: 'PENDING',
    priority: 'HIGH',
    submittedOffset: -5,
    decidedOffset: null,
    comment: 'Draft application circulated to the technical review committee.',
  },
  {
    code: 'AR-2009',
    subjectType: 'IPR',
    subjectId: iprIds['IPR-505'],
    requestType: 'IPR Filing Authorisation',
    description: 'Authorisation to file the rhizobacterial consortium application.',
    submittedBy: iprOfficer2,
    reviewer: committee[2],
    stage: 'Technical Review Committee',
    status: 'PENDING',
    priority: 'CRITICAL',
    submittedOffset: -4,
    decidedOffset: null,
    comment: 'Deadline for the filing window closes shortly — priority review requested.',
  },
  {
    code: 'AR-2010',
    subjectType: 'IPR',
    subjectId: iprIds['IPR-502'],
    requestType: 'IPR Filing Authorisation',
    description: 'Authorisation to file the sensor calibration method application.',
    submittedBy: iprOfficer,
    reviewer: committee[1],
    stage: 'Filing Authorisation',
    status: 'IN_REVIEW',
    priority: 'NORMAL',
    submittedOffset: -40,
    decidedOffset: null,
    comment: 'Technical review committee recommended filing.',
  },
  {
    code: 'AR-2011',
    subjectType: 'IPR',
    subjectId: iprIds['IPR-510'],
    requestType: 'IPR Filing Authorisation',
    description: 'Trademark clearance for the thermal storage module mark.',
    submittedBy: iprOfficer2,
    reviewer: committee[2],
    stage: 'IPR Officer Evaluation',
    status: 'REJECTED',
    priority: 'LOW',
    submittedOffset: -55,
    decidedOffset: -35,
    comment: 'The proposed mark conflicts with an existing registered mark in the district heating sector. Consider a revised mark.',
  },
  {
    code: 'AR-2012',
    subjectType: 'STARTUP',
    subjectId: 0,
    requestType: 'Startup Incubation Application',
    description: 'Initial incubation application review.',
    submittedBy: researchers[3],
    reviewer: incubationManager,
    stage: 'Eligibility Screening',
    status: 'PENDING',
    priority: 'NORMAL',
    submittedOffset: -3,
    decidedOffset: null,
    comment: 'Application received and queued for screening.',
  },
];

// Startup records are created before the approval list so AR-2012 can bind.
const startupDefs: Array<{
  code: string;
  name: string;
  founder: number;
  project: string | null;
  industry: string;
  stage: string;
  description: string;
  problem: string;
  solution: string;
  support: string;
  applicationOffset: number;
  progress: number;
  status: string;
}> = [
  {
    code: 'SU-101',
    name: 'AgroSense Analytics',
    founder: researchers[8],
    project: 'RP-1013',
    industry: 'Agricultural Technology',
    stage: 'GROWTH',
    description:
      'Subscription platform that turns soil moisture telemetry into irrigation scheduling advice for mid-sized cotton and tomato operations.',
    problem:
      'Growers irrigate on fixed schedules and lack a reliable, affordable way to know when a field actually needs water.',
    solution:
      'Telemetry nodes plus a deficit irrigation model that recommends irrigation depth and timing per block.',
    support: 'Pilot farm access, grant writing support, and technical mentoring on deployment logistics.',
    applicationOffset: -300,
    progress: 72,
    status: 'ACTIVE',
  },
  {
    code: 'SU-102',
    name: 'CryoGrid Materials',
    founder: researchers[5],
    project: 'RP-1004',
    industry: 'Advanced Manufacturing',
    stage: 'SEED',
    description:
      'Structural composite products made from reclaimed carbon fibre, targeting light-weighting programmes in transport and energy equipment.',
    problem:
      'Carbon fibre recycling is expensive and produces fibre with degraded mechanical properties, so recycled material rarely reaches structural use.',
    solution:
      'A surface treatment and impregnation route that restores structural-grade performance in recycled fibre.',
    support: 'Pilot manufacturing access, IP licensing guidance and introductions to industrial design partners.',
    applicationOffset: -210,
    progress: 58,
    status: 'ACTIVE',
  },
  {
    code: 'SU-103',
    name: 'BlueSense Networks',
    founder: researchers[2],
    project: 'RP-1002',
    industry: 'Environmental Monitoring',
    stage: 'INCUBATION',
    description:
      'Managed urban air quality monitoring networks for municipalities, built on calibrated low-cost sensor hardware and hosted analytics.',
    problem:
      'Municipal air quality coverage is sparse and reference-grade instruments are too costly to deploy widely.',
    solution:
      'Calibrated low-cost sensor networks with a hosted data platform and quarterly compliance reporting.',
    support: 'Hardware prototyping support, procurement guidance and pilot municipality introductions.',
    applicationOffset: -150,
    progress: 41,
    status: 'ACTIVE',
  },
  {
    code: 'SU-104',
    name: 'VitalTrace Wearables',
    founder: researchers[7],
    project: 'RP-1006',
    industry: 'Health Technology',
    stage: 'UNDER_REVIEW',
    description:
      'A clinical-grade ambulatory biosensor platform for continuous glucose and lactate monitoring, currently in validation.',
    problem:
      'Continuous multi-analyte monitoring for ambulatory patients remains expensive and largely limited to single-analyte devices.',
    solution:
      'A flexible epidermal sensor delivering simultaneous glucose and lactate readings over a seven-day wear window.',
    support: 'Clinical partner introductions, regulatory pathway guidance and grant support.',
    applicationOffset: -60,
    progress: 18,
    status: 'PENDING',
  },
  {
    code: 'SU-105',
    name: 'PulseCrop AI',
    founder: researchers[3],
    project: 'RP-1003',
    industry: 'Agricultural Technology',
    stage: 'INCUBATION',
    description:
      'Field application of explainable crop disease detection, delivering agronomist-facing advisories from ordinary field imagery.',
    problem:
      'Early disease detection needs expert agronomists who cannot physically inspect every field, every week.',
    solution:
      'An explainable vision model that flags early blight and rust and explains the visual evidence behind each alert.',
    support: 'Dataset licensing support, model deployment mentoring and agronomy partner introductions.',
    applicationOffset: -120,
    progress: 35,
    status: 'ACTIVE',
  },
  {
    code: 'SU-106',
    name: 'TerraCycle REE',
    founder: researchers[2],
    project: null,
    industry: 'Environmental Technology',
    stage: 'APPLIED',
    description:
      'A proposal to commercialise rare earth element recovery from industrial effluent once the underlying research is approved.',
    problem:
      'Rare earth elements are lost in industrial effluent streams, creating both a supply risk and an environmental liability.',
    solution:
      'Low-pH solvent extraction with a closed reagent loop to recover neodymium and dysprosium.',
    support: 'Laboratory space, materials characterisation support and guidance on the IP position.',
    applicationOffset: -12,
    progress: 4,
    status: 'PENDING',
  },
];

const startupIds: Record<string, number> = {};
for (const s of startupDefs) {
  const founder = db.prepare('SELECT full_name, email FROM users WHERE id = ?').get(s.founder) as any;
  const result = db
    .prepare(
      `INSERT INTO startups
        (startup_code, name, founder_user_id, related_project_id, industry, stage, description,
         problem, solution, support_required, application_date, status, progress, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      s.code,
      s.name,
      s.founder,
      s.project ? projectIds[s.project] : null,
      s.industry,
      s.stage,
      s.description,
      s.problem,
      s.solution,
      s.support,
      iso(s.applicationOffset),
      s.status,
      s.progress,
      incubationManager,
      iso(s.applicationOffset),
      nowIso(),
    );
  const id = Number(result.lastInsertRowid);
  startupIds[s.code] = id;
  db.prepare(
    `INSERT INTO startup_team_members (startup_id, user_id, name, email, member_role) VALUES (?, ?, ?, ?, 'FOUNDER')`,
  ).run(id, s.founder, founder.full_name, founder.email);
}

// Bind the startup approval request now that startup ids exist.
for (const a of approvalDefs) {
  const subjectId = a.subjectType === 'STARTUP' ? startupIds['SU-104'] : a.subjectId;
  const stages =
    a.subjectType === 'PROJECT'
      ? ['Departmental Scrutiny', 'Ethics & Compliance Review', 'Funding Assessment', 'Final Approval']
      : a.subjectType === 'IPR'
        ? ['IPR Officer Evaluation', 'Technical Review Committee', 'Filing Authorisation']
        : ['Eligibility Screening', 'Incubation Committee Review', 'Mentor Allocation'];

  const result = db
    .prepare(
      `INSERT INTO approval_requests
        (request_code, subject_type, subject_id, request_type, description, submitted_by,
         assigned_reviewer_id, current_stage, stages, status, priority, due_at, submitted_at, decided_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      a.code,
      a.subjectType,
      subjectId,
      a.requestType,
      a.description,
      a.submittedBy,
      a.reviewer,
      a.stage,
      JSON.stringify(stages),
      a.status,
      a.priority,
      iso(a.submittedOffset + 30),
      iso(a.submittedOffset),
      a.decidedOffset !== null ? iso(a.decidedOffset) : null,
    );
  const requestId = Number(result.lastInsertRowid);

  db.prepare(
    `INSERT INTO approval_decisions (request_id, reviewer_id, stage, decision, comment, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(requestId, a.submittedBy, stages[0], 'COMMENT', 'Request submitted for review.', iso(a.submittedOffset));

  if (a.decidedOffset !== null) {
    db.prepare(
      `INSERT INTO approval_decisions (request_id, reviewer_id, stage, decision, comment, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(
      requestId,
      a.reviewer,
      a.stage,
      a.status === 'REJECTED' ? 'REJECTED' : a.status === 'RETURNED_FOR_CORRECTION' ? 'CHANGES_REQUESTED' : 'APPROVED',
      a.comment,
      iso(a.decidedOffset),
    );
  }
}

// --------------------------------------------------- mentors and meetings
const mentorAssignments: Array<[string, number, number]> = [
  ['SU-101', mentors[0].id, -280],
  ['SU-101', mentors[3].id, -120],
  ['SU-102', mentors[3].id, -190],
  ['SU-103', mentors[1].id, -140],
  ['SU-105', mentors[1].id, -110],
];
for (const [code, mentorId, assignedOffset] of mentorAssignments) {
  db.prepare(
    `INSERT INTO mentor_assignments (mentor_id, startup_id, assigned_at, status, next_meeting_at)
     VALUES (?, ?, ?, 'ACTIVE', ?)`,
  ).run(mentorId, startupIds[code], iso(assignedOffset), iso(assignedOffset + 30));
}

const meetingDefs: Array<[string, number, number, string, string, string, string, string]> = [
  ['SU-101', mentors[0].id, -40, 'Pilot economics', 'Reviewed telemetry unit cost and maintenance intervals for three blocks.', 'Prepare a unit cost model with two suppliers.', 'OPEN', iso(10)],
  ['SU-101', mentors[0].id, -70, 'Field trial design', 'Discussed block-level irrigation control trials for the coming season.', 'Draft the trial protocol and share with the research team.', 'DONE', iso(-40)],
  ['SU-102', mentors[3].id, -25, 'Scale-up pathway', 'Mapped the qualification route from lab coupons to structural parts.', 'Request composite coupon data from the research group.', 'IN_PROGRESS', iso(5)],
  ['SU-103', mentors[1].id, -18, 'Product packaging', 'Agreed on packaging the sensor network as a managed service rather than hardware sales.', 'Prepare two commercial proposals.', 'OPEN', iso(12)],
  ['SU-105', mentors[1].id, -12, 'Agronomy validation', 'Reviewed the agronomist feedback cycle and support burden.', 'Design a lightweight review workflow for field agronomists.', 'OPEN', iso(8)],
];
for (const [code, mentorId, meetingOffset, agenda, notes, action, followStatus, followDue] of meetingDefs) {
  db.prepare(
    `INSERT INTO mentor_meetings
      (assignment_id, mentor_id, startup_id, meeting_date, agenda, notes, follow_up_action, follow_up_status, follow_up_due, created_at)
     VALUES (
       (SELECT id FROM mentor_assignments WHERE mentor_id = ? AND startup_id = ? AND status='ACTIVE'),
       ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    mentorId,
    startupIds[code],
    mentorId,
    startupIds[code],
    iso(meetingOffset),
    agenda,
    notes,
    action,
    followStatus,
    followDue,
    nowIso(),
  );
}

// ------------------------------------------------------ startup milestones
const startupMilestones: Array<[string, string, number, string, number, string]> = [
  ['SU-101', 'Pilot with three commercial farms', -60, 'COMPLETED', 100, 'Three farms signed on.'],
  ['SU-101', 'Telemetry hardware revision B', -20, 'COMPLETED', 100, 'Revision B deployed.'],
  ['SU-101', 'Subscription pricing model', 25, 'IN_PROGRESS', 60, ''],
  ['SU-101', 'Series A readiness review', 120, 'PENDING', 0, ''],
  ['SU-102', 'Coupon testing at partner lab', -40, 'COMPLETED', 100, ''],
  ['SU-102', 'ISO 9001 readiness assessment', 60, 'IN_PROGRESS', 35, ''],
  ['SU-102', 'First commercial structural part', 130, 'PENDING', 0, ''],
  ['SU-103', 'Hardware validation with municipality', -25, 'COMPLETED', 100, ''],
  ['SU-103', 'Managed service contract', 45, 'IN_PROGRESS', 45, ''],
  ['SU-105', 'Dataset licensing agreement', -30, 'COMPLETED', 100, ''],
  ['SU-105', 'Agronomist feedback pilot', 35, 'IN_PROGRESS', 55, ''],
  ['SU-104', 'Ethics approval for validation study', 20, 'IN_PROGRESS', 30, ''],
  ['SU-104', 'Clinical validation protocol sign-off', 90, 'PENDING', 0, ''],
  ['SU-106', 'Research project approval', 30, 'PENDING', 0, 'Awaiting departmental scrutiny.'],
];
for (const [code, title, dueOffset, status, progress, notes] of startupMilestones) {
  db.prepare(
    `INSERT INTO startup_milestones (startup_id, title, description, due_date, status, progress, notes, created_at, updated_at)
     VALUES (?, ?, '', ?, ?, ?, ?, ?, ?)`,
  ).run(startupIds[code], title, iso(dueOffset), status, progress, notes, nowIso(), nowIso());
}

// --------------------------------------------------- funding opportunities
const opportunityDefs: Array<{
  code: string;
  title: string;
  organization: string;
  category: string;
  domain: string;
  min: number;
  max: number;
  eligibility: string;
  description: string;
  opens: number;
  closes: number;
  url: string;
  status: string;
  notes: string;
}> = [
  {
    code: 'FO-301',
    title: 'National Research Innovation Fellowship Programme',
    organization: 'National Science Foundation (fictional)',
    category: 'RESEARCH',
    domain: 'Biotechnology',
    min: 250000,
    max: 900000,
    eligibility:
      'Open to tenured and early-career researchers with a full-time appointment at an accredited institution.',
    description:
      'Supports multi-year research programmes with a clear pathway to impact, including translational milestones and industry engagement.',
    opens: -120,
    closes: 25,
    url: 'https://example.org/funding/nrifp',
    status: 'OPEN',
    notes: 'Internal call opened with the research office. Two departmental nominations shortlisted.',
  },
  {
    code: 'FO-302',
    title: 'Climate Adaptation Research Grants',
    organization: 'Regional Environment Council (fictional)',
    category: 'RESEARCH',
    domain: 'Environmental Science',
    min: 150000,
    max: 500000,
    eligibility:
      'Eligible applicants must be affiliated with an accredited university and demonstrate a partnership with a public agency.',
    description:
      'Supports research on climate adaptation, with a requirement to publish datasets openly and to brief policy teams on findings.',
    opens: -200,
    closes: 9,
    url: 'https://example.org/funding/climate-adapt',
    status: 'OPEN',
    notes: 'Water quality surveillance proposal shortlisted for this round.',
  },
  {
    code: 'FO-303',
    title: 'University Venture Seed Grant',
    organization: 'Northgate University Foundation (fictional)',
    category: 'STARTUP',
    domain: 'Cross-disciplinary',
    min: 50000,
    max: 250000,
    eligibility:
      'Available to incorporated university spin-outs that have completed an incubation screening review and hold a signed IP position.',
    description:
      'Early-stage equity-free grant supporting product development, pilot deployments and early customer discovery.',
    opens: -300,
    closes: 120,
    url: 'https://example.org/funding/venture-seed',
    status: 'OPEN',
    notes: 'Internal panel meets monthly. Cut-off for the current cycle is in three weeks.',
  },
  {
    code: 'FO-304',
    title: 'Advanced Manufacturing Partnership Fund',
    organization: 'Industrial Innovation Alliance (fictional)',
    category: 'BOTH',
    domain: 'Materials Science',
    min: 300000,
    max: 1500000,
    eligibility:
      'Collaborative proposals require at least one industrial partner and a named research lead with relevant domain expertise.',
    description:
      'Co-funds applied manufacturing research and the scale-up of university-developed manufacturing processes.',
    opens: -80,
    closes: -5,
    url: 'https://example.org/funding/aip',
    status: 'CLOSED',
    notes: 'Closed for this cycle. Recycled carbon fibre programme was shortlisted but not funded.',
  },
  {
    code: 'FO-305',
    title: 'Digital Health Innovation Award',
    organization: 'Healthcare Futures Trust (fictional)',
    category: 'STARTUP',
    domain: 'Health Sciences',
    min: 100000,
    max: 600000,
    eligibility:
      'Spin-outs must have completed ethics and regulatory pathway documentation, or have an approved plan to do so.',
    description:
      'Non-dilutive award supporting clinical validation of digital health products, with access to a partner clinical network.',
    opens: -150,
    closes: 48,
    url: 'https://example.org/funding/dhi',
    status: 'OPEN',
    notes: 'Wearable biosensor startup is preparing an application once ethics approval completes.',
  },
  {
    code: 'FO-306',
    title: 'Open Research Infrastructure Fund',
    organization: 'Commonwealth Research Council (fictional)',
    category: 'RESEARCH',
    domain: 'Cross-disciplinary',
    min: 200000,
    max: 1200000,
    eligibility:
      'Open to all disciplines. Instrumentation and shared facility proposals are prioritised.',
    description:
      'Capital and maintenance support for shared research infrastructure, including instrument access schemes for early-career researchers.',
    opens: -400,
    closes: 75,
    url: 'https://example.org/funding/orif',
    status: 'OPEN',
    notes: 'Would support the shared telemetry node fabrication facility.',
  },
  {
    code: 'FO-307',
    title: 'Postdoctoral Fellowship Scheme in Energy Systems',
    organization: 'Energy Futures Council (fictional)',
    category: 'RESEARCH',
    domain: 'Renewable Energy',
    min: 60000,
    max: 120000,
    eligibility:
      'Host departments must confirm co-funding for the full fellowship duration.',
    description: 'Supports postdoctoral appointments in renewable energy systems, storage and grid integration.',
    opens: -30,
    closes: 60,
    url: 'https://example.org/funding/energy-pd',
    status: 'OPEN',
    notes: 'Recently reopened after a budget revision.',
  },
  {
    code: 'FO-308',
    title: 'Interdisciplinary Research Seed Fund',
    organization: 'Northgate University Research Council (fictional)',
    category: 'RESEARCH',
    domain: 'Cross-disciplinary',
    min: 10000,
    max: 40000,
    eligibility:
      'Open to cross-departmental teams of at least three academics. PhD students may be included as contributors.',
    description:
      'Small internal grants to test early-stage interdisciplinary ideas before committing to larger external funding.',
    opens: -220,
    closes: 150,
    url: '',
    status: 'OPEN',
    notes: 'Internal scheme, administered through the research office.',
  },
];

const opportunityIds: Record<string, number> = {};
for (const o of opportunityDefs) {
  const result = db
    .prepare(
      `INSERT INTO funding_opportunities
        (code, title, organization, category, domain, amount_min, amount_max, eligibility, description,
         opens_on, closes_on, external_url, status, internal_notes, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      o.code,
      o.title,
      o.organization,
      o.category,
      o.domain,
      o.min,
      o.max,
      o.eligibility,
      o.description,
      iso(o.opens),
      iso(o.closes),
      o.url || null,
      o.status,
      o.notes,
      admin,
      nowIso(),
      nowIso(),
    );
  opportunityIds[o.code] = Number(result.lastInsertRowid);
}

// ------------------------------------------------------- funding records
const fundingRecordDefs: Array<{
  subjectType: string;
  subjectId: number;
  source: string;
  opportunity: string | null;
  requested: number;
  approved: number;
  received: number;
  applicationOffset: number;
  decisionOffset: number | null;
  status: string;
  notes: string;
}> = [
  {
    subjectType: 'PROJECT',
    subjectId: projectIds['RP-1001'],
    source: 'National Research Innovation Fellowship Programme',
    opportunity: 'FO-301',
    requested: 780000,
    approved: 650000,
    received: 420000,
    applicationOffset: -220,
    decisionOffset: -195,
    status: 'PARTIALLY_RECEIVED',
    notes: 'Second tranche released against the year one milestone report.',
  },
  {
    subjectType: 'PROJECT',
    subjectId: projectIds['RP-1004'],
    source: 'Advanced Manufacturing Partnership Fund',
    opportunity: 'FO-304',
    requested: 1400000,
    approved: 0,
    received: 0,
    applicationOffset: -260,
    decisionOffset: -180,
    status: 'REJECTED',
    notes: 'Shortlisted but not funded in the last cycle. Resubmission planned for the next call.',
  },
  {
    subjectType: 'PROJECT',
    subjectId: projectIds['RP-1002'],
    source: 'Climate Adaptation Research Grants',
    opportunity: 'FO-302',
    requested: 320000,
    approved: 300000,
    received: 300000,
    applicationOffset: -190,
    decisionOffset: -160,
    status: 'RECEIVED',
    notes: 'Full award received and reconciled.',
  },
  {
    subjectType: 'PROJECT',
    subjectId: projectIds['RP-1003'],
    source: 'University Venture Seed Grant',
    opportunity: 'FO-303',
    requested: 90000,
    approved: 75000,
    received: 75000,
    applicationOffset: -170,
    decisionOffset: -140,
    status: 'RECEIVED',
    notes: 'Award converted into the company advance once the spin-out incorporated.',
  },
  {
    subjectType: 'PROJECT',
    subjectId: projectIds['RP-1006'],
    source: 'Digital Health Innovation Award',
    opportunity: 'FO-305',
    requested: 450000,
    approved: 0,
    received: 0,
    applicationOffset: -25,
    decisionOffset: null,
    status: 'REQUESTED',
    notes: 'Application prepared pending ethics committee outcome.',
  },
  {
    subjectType: 'PROJECT',
    subjectId: projectIds['RP-1013'],
    source: 'Open Research Infrastructure Fund',
    opportunity: 'FO-306',
    requested: 260000,
    approved: 180000,
    received: 180000,
    applicationOffset: -140,
    decisionOffset: -110,
    status: 'RECEIVED',
    notes: 'Supported the shared telemetry node fabrication facility.',
  },
  {
    subjectType: 'STARTUP',
    subjectId: startupIds['SU-101'],
    source: 'University Venture Seed Grant',
    opportunity: 'FO-303',
    requested: 200000,
    approved: 150000,
    received: 90000,
    applicationOffset: -200,
    decisionOffset: -170,
    status: 'PARTIALLY_RECEIVED',
    notes: 'Tranche two released on completion of the pricing model milestone.',
  },
  {
    subjectType: 'STARTUP',
    subjectId: startupIds['SU-102'],
    source: 'Advanced Manufacturing Partnership Fund',
    opportunity: 'FO-304',
    requested: 600000,
    approved: 0,
    received: 0,
    applicationOffset: -180,
    decisionOffset: -150,
    status: 'REJECTED',
    notes: 'Partner withdrew before the panel decision.',
  },
  {
    subjectType: 'STARTUP',
    subjectId: startupIds['SU-104'],
    source: 'Digital Health Innovation Award',
    opportunity: 'FO-305',
    requested: 500000,
    approved: 0,
    received: 0,
    applicationOffset: -18,
    decisionOffset: null,
    status: 'REQUESTED',
    notes: 'Awaiting clinical validation results before submission.',
  },
];
for (const f of fundingRecordDefs) {
  db.prepare(
    `INSERT INTO funding_records
      (subject_type, subject_id, source, opportunity_id, requested_amount, approved_amount,
       received_amount, application_date, decision_date, status, notes, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    f.subjectType,
    f.subjectId,
    f.source,
    f.opportunity ? opportunityIds[f.opportunity] : null,
    f.requested,
    f.approved,
    f.received,
    iso(f.applicationOffset),
    f.decisionOffset !== null ? iso(f.decisionOffset) : null,
    f.status,
    f.notes,
    nowIso(),
  );

  if (f.opportunity) {
    db.prepare(
      `INSERT INTO funding_applications
        (opportunity_id, subject_type, subject_id, requested_amount, application_date, status,
         approved_amount, decision_date, notes, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      opportunityIds[f.opportunity],
      f.subjectType,
      f.subjectId,
      f.requested,
      iso(f.applicationOffset),
      f.status === 'REJECTED' ? 'REJECTED' : f.approved > 0 ? 'APPROVED' : 'REQUESTED',
      f.approved,
      f.decisionOffset !== null ? iso(f.decisionOffset) : null,
      f.notes,
      nowIso(),
    );
  }
}

// ------------------------------------------------------------- documents
const documentDefs: Array<{
  name: string;
  category: string;
  relatedType: string | null;
  relatedId: number | null;
  uploadedBy: number;
  offset: number;
  type: string;
  size: number;
}> = [
  { name: 'RP-1001 Project Proposal', category: 'RESEARCH_PROPOSAL', relatedType: 'PROJECT', relatedId: projectIds['RP-1001'], uploadedBy: researchers[0], offset: -242, type: 'PDF', size: 1_842_301 },
  { name: 'RP-1001 Interim Report Year 1', category: 'RESEARCH_REPORT', relatedType: 'PROJECT', relatedId: projectIds['RP-1001'], uploadedBy: researchers[0], offset: -120, type: 'PDF', size: 2_310_554 },
  { name: 'RP-1002 Sensor Calibration Protocol', category: 'RESEARCH_PROPOSAL', relatedType: 'PROJECT', relatedId: projectIds['RP-1002'], uploadedBy: researchers[2], offset: -152, type: 'PDF', size: 980_112 },
  { name: 'RP-1003 Model Benchmark Report', category: 'RESEARCH_REPORT', relatedType: 'PROJECT', relatedId: projectIds['RP-1003'], uploadedBy: researchers[3], offset: -28, type: 'PDF', size: 3_412_770 },
  { name: 'RP-1004 Final Technical Report', category: 'RESEARCH_REPORT', relatedType: 'PROJECT', relatedId: projectIds['RP-1004'], uploadedBy: researchers[5], offset: -24, type: 'PDF', size: 5_221_904 },
  { name: 'RP-1006 Volunteer Ethics Protocol', category: 'RESEARCH_PROPOSAL', relatedType: 'PROJECT', relatedId: projectIds['RP-1006'], uploadedBy: researchers[7], offset: -40, type: 'DOCX', size: 411_002 },
  { name: 'RP-1011 Converter Letter of Support', category: 'OTHER', relatedType: 'PROJECT', relatedId: projectIds['RP-1011'], uploadedBy: researchers[5], offset: -17, type: 'PDF', size: 220_845 },
  { name: 'IPR-501 Draft Specification', category: 'IPR_DOCUMENT', relatedType: 'IPR', relatedId: iprIds['IPR-501'], uploadedBy: iprOfficer, offset: -130, type: 'DOCX', size: 780_412 },
  { name: 'IPR-501 Filing Receipt', category: 'IPR_DOCUMENT', relatedType: 'IPR', relatedId: iprIds['IPR-501'], uploadedBy: iprOfficer, offset: -118, type: 'PDF', size: 142_003 },
  { name: 'IPR-504 Examination Correspondence', category: 'IPR_DOCUMENT', relatedType: 'IPR', relatedId: iprIds['IPR-504'], uploadedBy: iprOfficer, offset: -60, type: 'PDF', size: 318_447 },
  { name: 'AR-2002 Ethics Review Comments', category: 'APPROVAL_LETTER', relatedType: 'APPROVAL', relatedId: 5, uploadedBy: committee[0], offset: -12, type: 'PDF', size: 201_884 },
  { name: 'AR-2005 Revision Request', category: 'APPROVAL_LETTER', relatedType: 'APPROVAL', relatedId: 8, uploadedBy: committee[0], offset: -16, type: 'PDF', size: 154_221 },
  { name: 'AR-2007 Funding Approval Letter', category: 'APPROVAL_LETTER', relatedType: 'APPROVAL', relatedId: 9, uploadedBy: committee[2], offset: -317, type: 'PDF', size: 176_930 },
  { name: 'SU-101 Business Plan', category: 'STARTUP_DOCUMENT', relatedType: 'STARTUP', relatedId: startupIds['SU-101'], uploadedBy: incubationManager, offset: -295, type: 'PDF', size: 1_120_774 },
  { name: 'SU-102 Structural Test Certificate', category: 'STARTUP_DOCUMENT', relatedType: 'STARTUP', relatedId: startupIds['SU-102'], uploadedBy: incubationManager, offset: -42, type: 'PDF', size: 512_663 },
  { name: 'SU-103 Municipality Pilot Agreement', category: 'STARTUP_DOCUMENT', relatedType: 'STARTUP', relatedId: startupIds['SU-103'], uploadedBy: incubationManager, offset: -28, type: 'PDF', size: 388_120 },
  { name: 'SU-105 Dataset Licence Agreement', category: 'STARTUP_DOCUMENT', relatedType: 'STARTUP', relatedId: startupIds['SU-105'], uploadedBy: incubationManager, offset: -31, type: 'PDF', size: 265_441 },
  { name: 'RP-1003 Agronomy Validation Paper', category: 'PUBLICATION', relatedType: 'PROJECT', relatedId: projectIds['RP-1003'], uploadedBy: researchers[3], offset: -22, type: 'PDF', size: 1_884_005 },
  { name: 'RP-1004 Recycled Fibre Performance Paper', category: 'PUBLICATION', relatedType: 'PROJECT', relatedId: projectIds['RP-1004'], uploadedBy: researchers[5], offset: -26, type: 'PDF', size: 2_006_772 },
  { name: 'FO-301 Award Letter', category: 'FUNDING_DOCUMENT', relatedType: 'FUNDING', relatedId: opportunityIds['FO-301'], uploadedBy: admin, offset: -194, type: 'PDF', size: 133_990 },
  { name: 'FO-302 Award Letter', category: 'FUNDING_DOCUMENT', relatedType: 'FUNDING', relatedId: opportunityIds['FO-302'], uploadedBy: admin, offset: -159, type: 'PDF', size: 128_441 },
  { name: 'FO-304 Decision Letter', category: 'FUNDING_DOCUMENT', relatedType: 'FUNDING', relatedId: opportunityIds['FO-304'], uploadedBy: admin, offset: -179, type: 'PDF', size: 121_776 },
  { name: 'RP-1008 Equipment Quotation', category: 'OTHER', relatedType: 'PROJECT', relatedId: projectIds['RP-1008'], uploadedBy: researchers[6], offset: -10, type: 'XLSX', size: 88_210 },
];
for (const d of documentDefs) {
  db.prepare(
    `INSERT INTO documents
      (name, description, category, related_type, related_id, uploaded_by, upload_date,
       file_type, file_size, storage_path, checksum, status, version, created_at)
     VALUES (?, '', ?, ?, ?, ?, ?, ?, ?, ?, '', 'ACTIVE', 1, ?)`,
  ).run(
    d.name,
    d.category,
    d.relatedType,
    d.relatedId,
    d.uploadedBy,
    iso(d.offset),
    d.type,
    d.size,
    `seed/${d.name.toLowerCase().replace(/[^a-z0-9.]+/g, '-')}`,
    nowIso(),
  );
}

// ------------------------------------------------------------ audit trail
const auditSeed: Array<
  [string, number | null, string, string, number, string | null, string | null, string]
> = [];
for (const p of projectDefs) {
  auditSeed.push(['PROJECT', projectIds[p.code], p.code, 'PROJECT_CREATED', p.pi, null, 'DRAFT', 'Project record created.']);
  if (p.submittedOffset !== null) {
    auditSeed.push(['PROJECT', projectIds[p.code], p.code, 'STATUS_CHANGED', p.pi, 'DRAFT', 'SUBMITTED', 'Submitted for review.']);
  }
  if (p.approvedOffset !== null) {
    auditSeed.push(['PROJECT', projectIds[p.code], p.code, 'STATUS_CHANGED', committee[0], 'UNDER_REVIEW', 'APPROVED', 'Approved by the research committee.']);
  }
  if (p.completedOffset !== null) {
    auditSeed.push(['PROJECT', projectIds[p.code], p.code, 'STATUS_CHANGED', p.pi, 'ACTIVE', 'COMPLETED', 'Final report accepted and project closed.']);
  }
}
for (const r of iprDefs) {
  auditSeed.push(['IPR', iprIds[r.code], r.code, 'IPR_CREATED', r.officer, null, 'DRAFT', 'IPR record created.']);
  if (r.filingOffset !== null) {
    auditSeed.push(['IPR', iprIds[r.code], r.code, 'IPR_STATUS_CHANGED', r.officer, 'APPROVED_FOR_FILING', 'FILED', 'Filing acknowledged by the office.']);
  }
}
for (const s of startupDefs) {
  auditSeed.push(['STARTUP', startupIds[s.code], s.code, 'STARTUP_REGISTERED', incubationManager, null, 'APPLIED', 'Incubation application registered.']);
}
for (const a of approvalDefs) {
  auditSeed.push(['APPROVAL', null, a.code, 'APPROVAL_REQUESTED', a.submittedBy, null, 'PENDING', `${a.requestType} submitted for review.`]);
  if (a.decidedOffset !== null) {
    auditSeed.push([
      'APPROVAL',
      null,
      a.code,
      a.status === 'REJECTED' ? 'DECISION_REJECTED' : a.status === 'RETURNED_FOR_CORRECTION' ? 'DECISION_CHANGES_REQUESTED' : 'DECISION_APPROVED',
      a.reviewer,
      'IN_REVIEW',
      a.status,
      a.comment,
    ]);
  }
}
for (const [entityType, entityId, code, action, actor, from, to, details] of auditSeed) {
  const offset = -Math.floor(Math.random() * 200) - 1;
  db.prepare(
    `INSERT INTO audit_logs (entity_type, entity_id, entity_code, action, actor_id, from_status, to_status, details, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(entityType, entityId, code, action, actor, from, to, details, iso(offset));
}

// -------------------------------------------------------------- settings
const settings: Record<string, unknown> = {
  deadline_reminder_days: [30, 7, 1],
  project_categories: [
    'Basic Research',
    'Applied Research',
    'Interdisciplinary',
    'Clinical Research',
    'Developmental Research',
    'Industrial Research',
  ],
  research_domains: [
    'Biotechnology',
    'Environmental Science',
    'Artificial Intelligence',
    'Materials Science',
    'Renewable Energy',
    'Health Sciences',
    'Agricultural Technology',
  ],
  workflow_configuration: {
    project: {
      DRAFT: ['SUBMITTED', 'ON_HOLD'],
      SUBMITTED: ['UNDER_REVIEW', 'DRAFT', 'ON_HOLD'],
      UNDER_REVIEW: ['APPROVED', 'REJECTED', 'RETURNED_FOR_CORRECTION', 'ON_HOLD'],
      RETURNED_FOR_CORRECTION: ['SUBMITTED', 'DRAFT'],
      APPROVED: ['ACTIVE', 'ON_HOLD'],
      ACTIVE: ['COMPLETED', 'ON_HOLD'],
      ON_HOLD: ['ACTIVE', 'UNDER_REVIEW', 'COMPLETED'],
      REJECTED: ['DRAFT'],
      COMPLETED: [],
    },
    ipr: {
      DRAFT: ['UNDER_EVALUATION', 'CLOSED'],
      UNDER_EVALUATION: ['APPROVED_FOR_FILING', 'REJECTED', 'CLOSED'],
      APPROVED_FOR_FILING: ['FILED', 'CLOSED'],
      FILED: ['UNDER_EXAMINATION', 'GRANTED', 'REJECTED'],
      UNDER_EXAMINATION: ['GRANTED', 'REJECTED'],
      GRANTED: ['CLOSED'],
      REJECTED: ['CLOSED', 'DRAFT'],
      CLOSED: [],
    },
  },
  notification_preferences: {
    emailEnabled: false,
    inAppEnabled: true,
    categories: ['DEADLINE', 'OVERDUE', 'NEW_APPROVAL', 'APPROVAL_DECISION'],
  },
  system_preferences: {
    institutionName: 'Northgate University',
    systemName: 'Research & Innovation Hub',
    supportEmail: 'research-hub@northgate.edu',
    demoMode: true,
    fileSizeLimitMb: 10,
    sessionDays: 7,
  },
};
for (const [key, value] of Object.entries(settings)) {
  db.prepare('INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)').run(
    key,
    JSON.stringify(value),
    nowIso(),
  );
}

// --------------------------------------------------------- notifications
const notificationRows: Array<[number, string, string, string, string, number]> = [
  [admin, 'DEADLINE', 'IPR deadline in 6 day(s): IPR-503', '"Attention Attribution Map for Plant Disease Classification" is due soon.', '/ipr/' + iprIds['IPR-503'], 0],
  [admin, 'DEADLINE', 'IPR deadline in 3 day(s): IPR-505', '"Rhizobacterial Consortium for Water-Use Efficiency in Pulses" is due soon.', '/ipr/' + iprIds['IPR-505'], 0],
  [admin, 'OVERDUE', 'IPR deadline overdue: IPR-507', '"Designed Antimicrobial Peptide Library and Screening Protocol" passed its deadline.', '/ipr/' + iprIds['IPR-507'], 0],
  [admin, 'NEW_APPROVAL', 'New approval task: AR-2009', 'IPR Filing Authorisation — Rhizobacterial Consortium for Water-Use Efficiency in Pulses', '/approvals', 0],
  [admin, 'NEW_APPROVAL', 'New approval task: AR-2008', 'IPR Filing Authorisation — Attention Attribution Map for Plant Disease Classification', '/approvals', 0],
  [admin, 'SYSTEM', 'Welcome to the Research & Innovation Hub', 'This installation is running in demo mode with seeded sample data.', '/dashboard', 1],
  [committee[0], 'NEW_APPROVAL', 'New approval task: AR-2002', 'Research Project Approval — Wearable Biosensor for Continuous Glucose and Lactate Tracking', '/approvals', 0],
  [committee[0], 'NEW_APPROVAL', 'New approval task: AR-2008', 'IPR Filing Authorisation — Attention Attribution Map for Plant Disease Classification', '/approvals', 0],
  [committee[2], 'NEW_APPROVAL', 'New approval task: AR-2009', 'IPR Filing Authorisation — Rhizobacterial Consortium for Water-Use Efficiency in Pulses', '/approvals', 0],
  [researchers[2], 'RETURNED_FOR_CORRECTION', 'Changes requested: AR-2005', 'Please attach the reagent hazard assessment and clarify the effluent characterisation methodology.', '/approvals', 0],
  [researchers[6], 'PROJECT_MILESTONE', 'Milestone due in 30 day(s): Material screening campaign', 'Project RP-1005 milestone is due soon.', '/projects/' + projectIds['RP-1005'], 0],
  [researchers[3], 'PROJECT_MILESTONE', 'Milestone due in 20 day(s): Agronomist validation sessions', 'Project RP-1003 milestone is due soon.', '/projects/' + projectIds['RP-1003'], 0],
  [researchers[8], 'STARTUP_MILESTONE', 'Startup milestone due soon: Subscription pricing model', 'SU-101 milestone is approaching its due date.', '/startups/' + startupIds['SU-101'], 0],
  [incubationManager, 'FUNDING_DEADLINE', 'Funding deadline in 9 day(s): FO-302', '"Climate Adaptation Research Grants" closes soon.', '/funding/' + opportunityIds['FO-302'], 0],
  [incubationManager, 'FUNDING_DEADLINE', 'Funding deadline in 25 day(s): FO-301', '"National Research Innovation Fellowship Programme" closes soon.', '/funding/' + opportunityIds['FO-301'], 0],
  [iprOfficer, 'DEADLINE', 'IPR deadline in 18 day(s): IPR-501', '"Method for Drought-Tolerance Editing in Millet Using CRISPR-Cas9" is due soon.', '/ipr/' + iprIds['IPR-501'], 0],
  [iprOfficer2, 'DEADLINE', 'IPR deadline in 6 day(s): IPR-503', '"Attention Attribution Map for Plant Disease Classification" is due soon.', '/ipr/' + iprIds['IPR-503'], 0],
  [mentors[0].userId, 'STARTUP_MILESTONE', 'Startup milestone due in 10 day(s): Pilot economics follow-up', 'SU-101 follow-up action is approaching its due date.', '/startups/' + startupIds['SU-101'], 0],
];
let notifOffset = 0;
for (const [userId, category, title, description, link, isRead] of notificationRows) {
  db.prepare(
    `INSERT INTO notifications (user_id, category, title, description, link, is_read, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(userId, category, title, description, link, isRead, iso(-notifOffset++));
}

// --------------------------------------------------------------- summary
const counts = {
  departments: (db.prepare('SELECT COUNT(*) AS c FROM departments').get() as any).c,
  users: (db.prepare('SELECT COUNT(*) AS c FROM users').get() as any).c,
  projects: (db.prepare('SELECT COUNT(*) AS c FROM research_projects').get() as any).c,
  milestones: (db.prepare('SELECT COUNT(*) AS c FROM project_milestones').get() as any).c,
  ipr: (db.prepare('SELECT COUNT(*) AS c FROM ipr_records').get() as any).c,
  approvals: (db.prepare('SELECT COUNT(*) AS c FROM approval_requests').get() as any).c,
  startups: (db.prepare('SELECT COUNT(*) AS c FROM startups').get() as any).c,
  mentors: (db.prepare('SELECT COUNT(*) AS c FROM mentors').get() as any).c,
  opportunities: (db.prepare('SELECT COUNT(*) AS c FROM funding_opportunities').get() as any).c,
  fundingRecords: (db.prepare('SELECT COUNT(*) AS c FROM funding_records').get() as any).c,
  documents: (db.prepare('SELECT COUNT(*) AS c FROM documents').get() as any).c,
  auditLogs: (db.prepare('SELECT COUNT(*) AS c FROM audit_logs').get() as any).c,
};
generateDeadlineNotifications([30, 7, 1]);

console.log('\nSeed complete. Fictional demo data inserted:');
for (const [k, v] of Object.entries(counts)) {
  console.log(`  ${k.padEnd(16)} ${v}`);
}
console.log(`\nAll demo accounts use the password: ${DEMO_PASSWORD}`);
console.log('Example sign-in: admin@northgate.edu\n');
