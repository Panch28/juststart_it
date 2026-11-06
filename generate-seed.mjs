// Deterministic synthetic seed generator for the Research & Innovation Hub.
// Usage: node generate-seed.mjs [outDir]    (optional env SEED_TODAY=YYYY-MM-DD)
// All dates are computed relative to "today" so overdue / days-pending never go stale.
import fs from 'node:fs';
const OUT = process.argv[2] ?? '.';
const DAY = 86400000;
const TODAY = process.env.SEED_TODAY
  ? new Date(process.env.SEED_TODAY + 'T00:00:00Z')
  : new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00Z');
const ago = n => new Date(TODAY.getTime() - n * DAY);
const addDays = (d, n) => new Date(d.getTime() + n * DAY);
const daysBetween = (a, b) => Math.round((b.getTime() - a.getTime()) / DAY);
const iso = d => d.toISOString();
const dOnly = d => d.toISOString().slice(0, 10);
function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
const rnd = mulberry32(20261104);
const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const pick = arr => arr[Math.floor(rnd() * arr.length)];
const stamp = (d, h) => new Date(d.getTime() + (h ?? ri(10, 17)) * 3600000 + ri(0, 59) * 60000);
const L = 100000; // 1 lakh INR

// ---------- departments ----------
const departments = [
  { id: 1, code: 'ENVS', name: 'Environmental Science', domain: 'Environment' },
  { id: 2, code: 'BIOT', name: 'Biotechnology', domain: 'Life Sciences' },
  { id: 3, code: 'CSAI', name: 'Computer Science & AI', domain: 'Computing & AI' },
  { id: 4, code: 'MATS', name: 'Materials Science', domain: 'Materials' },
  { id: 5, code: 'REEN', name: 'Renewable Energy', domain: 'Energy' },
  { id: 6, code: 'AGRI', name: 'Agriculture & Food Technology', domain: 'Agriculture' },
  { id: 7, code: 'HLTH', name: 'Health Sciences', domain: 'Healthcare' },
];
const deptByCode = Object.fromEntries(departments.map(d => [d.code, d]));

// ---------- users (fictional names, reserved example.edu emails) ----------
const FIRST = ['Anika','Rohan','Meera','Vikram','Sanjana','Arjun','Divya','Karthik','Lakshmi','Nikhil','Pooja','Suresh','Tanvi','Harish','Ishita','Manoj','Neha','Prakash','Rekha','Siddharth','Aditi','Girish','Kavya','Omkar','Shruti','Vinay','Bhavna','Chetan','Deepa','Faisal','Geeta','Imran','Jyoti','Kiran','Madhav','Nandini','Pranav','Revathi','Sameer','Tara'];
const LAST = ['Raghunathan','Deshpande','Menon','Kulkarni','Bhatt','Nambiar','Joshi','Pillai','Hegde','Srinivasan','Chandran','Patwardhan','Gowda','Iyengar','Rastogi','Naidu','Banerjee','Shetty','Varma','Kamath','Acharya','Balakrishnan','Dixit','Fernandes','Gadgil','Hosmani','Itagi','Jadhav','Karnik','Lobo','Mhatre','Nayak','Oak','Prabhu','Quadri','Rangan','Saldanha','Thakur','Upadhyay','Wagle'];
const users = [];
function mkUser(role, title, deptCode, extra = {}) {
  const i = users.length;
  const first = FIRST[i % FIRST.length], last = LAST[(i * 7 + 3) % LAST.length];
  const u = { id: i + 1, full_name: `${first} ${last}`, display_name: `${title ? title + ' ' : ''}${first} ${last}`,
    email: `${first}.${last}`.toLowerCase() + '@example.edu', role, department: deptCode, is_active: true,
    created_at: iso(ago(520)), ...extra };
  users.push(u); return u;
}
const admin = mkUser('Administrator', 'Dr.', null);
const researchers = [];
for (const d of departments) { researchers.push(mkUser('Researcher', 'Dr.', d.code)); researchers.push(mkUser('Researcher', 'Prof.', d.code)); }
const committee = [mkUser('Approval Committee Member', 'Prof.', null), mkUser('Approval Committee Member', 'Dr.', null), mkUser('Approval Committee Member', 'Prof.', null)];
const officers = [mkUser('IPR Officer', '', null), mkUser('IPR Officer', '', null)];
const incMgr = mkUser('Incubation Manager', '', null);
const EXPERT = ['Medical devices and diagnostics', 'Deep-tech fundraising', 'Agri and food supply chains', 'Hardware manufacturing and materials'];
const mentors = EXPERT.map(e => mkUser('Mentor', '', null, { expertise: e }));

// ---------- projects ----------
const P = [
 ['ENVS','Low-Cost Sensor Network for Urban Air Quality Monitoring','Deploys calibrated low-cost particulate and gas sensors across city wards and evaluates drift against reference stations over twelve months.',['air quality','sensors','calibration'],'Completed'],
 ['ENVS','Constructed Wetlands for Greywater Reuse in Apartment Complexes','Pilot-scale wetlands treat apartment greywater for landscaping reuse, measuring nutrient removal and maintenance burden.',['wetlands','greywater','reuse'],'Active'],
 ['ENVS','Microplastic Load in Urban Lake Sediments','Quantifies microplastic concentration and polymer types in sediment cores from three urban lakes to reconstruct accumulation trends.',['microplastics','sediment','lakes'],'Under Review'],
 ['ENVS','Satellite-Based Mapping of Urban Heat Islands','Combines thermal satellite imagery with land cover data to map heat islands and test green-roof mitigation scenarios.',['heat island','remote sensing','urban planning'],'Submitted'],
 ['BIOT','Antimicrobial Peptide Library Screening Against Resistant Bacteria','Builds and screens a designed peptide library for activity against drug-resistant clinical bacterial isolates with low host toxicity.',['antimicrobial peptides','resistance','screening'],'Active'],
 ['BIOT','CRISPR-Based Drought Tolerance in Finger Millet','Edits stress-response genes in finger millet and measures yield stability under controlled water deficit.',['CRISPR','drought','millet'],'Approved'],
 ['BIOT','Rapid Paper-Based Diagnostic for Dengue Detection','Develops a low-cost paper-based assay for early dengue antigen detection suitable for primary health centres.',['diagnostics','dengue','paper assay'],'Completed'],
 ['BIOT','Probiotic Consortia for Poultry Gut Health','Tests defined probiotic consortia as an alternative to antibiotic growth promoters in poultry feed trials.',['probiotics','poultry','gut health'],'Draft'],
 ['CSAI','Attention Maps for Explainable Plant Disease Classification','Trains vision models on leaf images and evaluates attention-based explanations against expert-marked lesion regions.',['explainability','computer vision','plant disease'],'Active'],
 ['CSAI','Federated Learning for Hospital Records Without Data Sharing','Evaluates federated training across simulated hospital silos and measures accuracy loss versus centralised training.',['federated learning','privacy','healthcare'],'Under Review'],
 ['CSAI','Low-Resource Speech Recognition for Kannada Dialects','Builds a small annotated corpus and fine-tunes speech models for regional Kannada dialects with limited labelled audio.',['speech recognition','Kannada','low-resource'],'Approved'],
 ['CSAI','Anomaly Detection in Smart Grid Meter Streams','Compares lightweight streaming anomaly detectors for detecting theft and faults in smart meter data.',['anomaly detection','smart grid','streaming'],'Submitted'],
 ['MATS','Recycled Carbon Fibre Reinforced Thermoplastic Composites','Characterises mechanical properties of thermoplastic composites made with recycled carbon fibre for automotive panels.',['composites','recycling','carbon fibre'],'Completed'],
 ['MATS','Phase Change Materials for Building Thermal Storage','Develops encapsulated phase change materials and tests passive cooling performance in wall panels.',['phase change','thermal storage','buildings'],'Active'],
 ['MATS','Graphene-Coated Electrodes for Low-Cost Biosensing','Fabricates graphene-coated electrodes and compares sensitivity and stability for electrochemical biosensors.',['graphene','electrodes','biosensors'],'Under Review'],
 ['MATS','Self-Healing Concrete Using Bacterial Spores','Embeds bacterial spores in concrete mixes and measures crack-closure rates and strength recovery.',['self-healing','concrete','bacteria'],'Rejected'],
 ['REEN','Perovskite Solar Cell Stability Under Humid Conditions','Tests encapsulation strategies that extend perovskite cell lifetime under high humidity and thermal cycling.',['perovskite','solar','stability'],'Active'],
 ['REEN','Second-Life Battery Packs for Rural Microgrids','Assesses repurposed electric vehicle battery packs for village microgrids, covering degradation and safety monitoring.',['batteries','second life','microgrid'],'Approved'],
 ['REEN','Biogas Yield Optimisation from Mixed Agricultural Waste','Optimises feedstock ratios and pretreatment to raise biogas yield from crop residue and dairy waste.',['biogas','waste','optimisation'],'Completed'],
 ['REEN','Small-Scale Wind Turbine Blade Design for Low Wind Speeds','Designs and tests blade profiles for turbines operating at low average wind speeds typical of inland sites.',['wind','turbine','aerodynamics'],'Draft'],
 ['AGRI','Rhizobacterial Consortium for Water-Use Efficiency in Pulses','Field trials of rhizobacterial consortia to improve water-use efficiency and yield in pulse crops under limited irrigation.',['rhizobacteria','pulses','water use'],'Active'],
 ['AGRI','Soil Moisture Forecasting for Smallholder Irrigation Scheduling','Combines low-cost soil probes with weather forecasts to schedule irrigation for smallholder farms.',['soil moisture','irrigation','forecasting'],'Under Review'],
 ['AGRI','Post-Harvest Loss Reduction in Tomato Supply Chains','Maps loss points from farm to market and tests low-cost cold-chain interventions.',['post-harvest','supply chain','tomato'],'Submitted'],
 ['AGRI','Natural Pigment Extraction from Agricultural By-Products','Extracts and stabilises natural pigments from fruit and vegetable by-products for food colouring uses.',['pigments','by-products','food technology'],'Completed'],
 ['HLTH','Wearable Sensing for Early Detection of Maternal Health Risk','Evaluates wrist-worn sensors for flagging pregnancy-related risk signs and tests alert thresholds with clinicians.',['wearables','maternal health','screening'],'Under Review'],
 ['HLTH','Digital Adherence Support for Tuberculosis Treatment','Tests a reminder and tracking app to improve treatment adherence among community health clients.',['tuberculosis','adherence','mobile health'],'Active'],
 ['HLTH','Low-Cost Prosthetic Hand Using 3D-Printed Components','Designs a 3D-printed prosthetic hand with tendon actuation and evaluates grip performance and cost.',['prosthetics','3D printing','rehabilitation'],'Rejected'],
 ['HLTH','Nutritional Screening Tool for School Children','Validates a short screening tool for identifying malnutrition risk in school children across three districts.',['nutrition','screening','children'],'Draft'],
];
// submitted_days_ago for decided projects; pending: [daysPending, currentStageIdx]
const S_DECIDED = {1:430,7:380,13:300,19:340,24:470, 2:150,5:210,9:170,14:260,17:110,21:130,26:200, 6:38,11:30,18:44, 16:150,27:80};
const PENDING = {3:[19,1],10:[12,0],15:[9,2],22:[25,1],25:[6,0],4:[5,0],12:[4,0],23:[2,0]};
const DRAFT_AGO = {8:9,20:4,28:6};
const REJECT_AT = {16:2, 27:1};
const CHANGES_AT = {6:1, 14:1};

const PSTAGES = ['Departmental scrutiny','Ethics & compliance review','Funding assessment','Final approval'];
const pRev = k => committee[[0,1,2,0][k]].id;
const ISTAGES = ['Filing authorisation','IPR officer evaluation','Technical review committee'];
const SSTAGES = ['Eligibility screening','Incubation committee'];
const OKS = ['Meets requirements.','Approved. Proceed to the next stage.','Documentation complete; approved.','Methodology is sound; approved.','No concerns raised.'];
const CHANGES = ['Please clarify the sample size and data management plan.','Budget justification is incomplete; revise and resubmit.','Add risk mitigation for field work and resubmit.'];
const REJECTS = ['Scope overlaps substantially with an existing funded project.','Ethics clearance requirements are not met in the current design.','Costs are not justified relative to expected outcomes.'];

function decided(stages, rev, submitted, { rejectAt = null, changesAt = null } = {}) {
  const decisions = []; let t = submitted;
  for (let k = 0; k < stages.length; k++) {
    if (changesAt === k) {
      t = addDays(t, ri(2, 6));
      decisions.push({ stage_index: k, stage: stages[k], reviewer_id: rev(k), decision: 'Changes requested', comment: pick(CHANGES), decided_at: iso(stamp(t)) });
      t = addDays(t, ri(3, 6));
    }
    t = addDays(t, ri(2, 6));
    if (rejectAt === k) {
      decisions.push({ stage_index: k, stage: stages[k], reviewer_id: rev(k), decision: 'Rejected', comment: pick(REJECTS), decided_at: iso(stamp(t)) });
      return { decisions, finalDate: t, status: 'Rejected', stage_index: null };
    }
    decisions.push({ stage_index: k, stage: stages[k], reviewer_id: rev(k), decision: 'Approved', comment: pick(OKS), decided_at: iso(stamp(t)) });
  }
  return { decisions, finalDate: t, status: 'Approved', stage_index: null };
}
function pendingApproval(stages, rev, submitted, P, idx) {
  const decisions = [];
  for (let j = 0; j < idx; j++) {
    const t = addDays(submitted, Math.floor(P * (j + 1) / (idx + 1)));
    decisions.push({ stage_index: j, stage: stages[j], reviewer_id: rev(j), decision: 'Approved', comment: pick(OKS), decided_at: iso(stamp(t, ri(10, 17))) });
  }
  const entered = idx === 0 ? submitted : addDays(submitted, Math.floor(P * idx / (idx + 1)));
  return { decisions, finalDate: null, status: 'Pending', stage_index: idx, entered_stage_at: iso(stamp(entered, 12)) };
}

const approvals = []; // raw, ids assigned later
const projects = [];
const byDeptCount = {};
const MS = ['Literature review & protocol','Pilot setup & baseline','Data collection','Analysis & validation','Final report & handover'];
function projMilestones(status, start, end) {
  const idxs = rnd() < 0.5 ? [0, 1, 2, 4] : [0, 2, 3, 4]; const m = idxs.length; const out = [];
  let foundActive = false;
  for (let i = 0; i < m; i++) {
    const due = addDays(start, Math.round((i + 1) / m * daysBetween(start, end)));
    let st, comp = null;
    if (status === 'Completed') { st = 'Completed'; comp = addDays(due, -ri(0, 6)); }
    else if (status === 'Active') {
      if (due < addDays(TODAY, -5)) { st = 'Completed'; comp = addDays(due, -ri(0, 5)); }
      else if (!foundActive) { st = 'In progress'; foundActive = true; } else st = 'Pending';
    } else st = 'Pending';
    if (comp && comp > ago(1)) comp = ago(1);
    out.push({ title: MS[idxs[i]], due_date: dOnly(due), status: st, completed_at: comp ? dOnly(comp) : null });
  }
  return out;
}
P.forEach((row, i) => {
  const id = i + 1; const [dept, title, abstract, kw, status] = row;
  byDeptCount[dept] = byDeptCount[dept] ?? 0;
  const deptResearchers = researchers.filter(r => r.department === dept);
  const lead = deptResearchers[byDeptCount[dept] % 2]; byDeptCount[dept]++;
  const others = researchers.filter(r => r.id !== lead.id);
  const team = []; const nTeam = ri(1, 2);
  while (team.length < nTeam) { const c = pick(others); if (!team.find(t => t.user_id === c.id)) team.push({ user_id: c.id, role: 'Co-investigator' }); }
  const proj = { id, code: `PRJ-${1000 + id}`, title, abstract, keywords: kw, department: dept, domain: deptByCode[dept].domain, status,
    lead_researcher_id: lead.id, team, budget_inr: ri(8, 80) * 50000, submitted_at: null, start_date: null, end_date: null, created_at: null, milestones: [], source: 'synthetic' };
  let ap = null;
  if (S_DECIDED[id]) {
    const sub = stamp(ago(S_DECIDED[id]), 9); proj.submitted_at = iso(sub);
    proj.created_at = iso(addDays(sub, -ri(2, 10)));
    const r = decided(PSTAGES, pRev, sub, { rejectAt: REJECT_AT[id] ?? null, changesAt: CHANGES_AT[id] ?? null });
    ap = { subject_type: 'PROJECT', subject_id: id, subject_code: proj.code, subject_title: title, submitted_by: lead.id, submitted_at: proj.submitted_at, status: r.status, final_decided_at: iso(stamp(r.finalDate)), stages: PSTAGES, decisions: r.decisions, current_stage: null, current_stage_name: null, current_reviewer_id: null };
    if (status === 'Approved') { proj.start_date = dOnly(addDays(TODAY, ri(7, 21))); proj.end_date = dOnly(addDays(new Date(proj.start_date), 365)); }
    if (status === 'Active') { const s = addDays(r.finalDate, 7); proj.start_date = dOnly(s); proj.end_date = dOnly(addDays(s, pick([270, 365, 450]))); }
    if (status === 'Completed') { const s = addDays(r.finalDate, 7); const startAgo = daysBetween(s, TODAY); const dur = Math.min(240, startAgo - 20); proj.start_date = dOnly(s); proj.end_date = dOnly(addDays(s, dur)); }
    proj._final = r.finalDate;
    if (['Approved', 'Active', 'Completed'].includes(status)) proj.milestones = projMilestones(status, new Date(proj.start_date), new Date(proj.end_date));
  } else if (PENDING[id]) {
    const [Pd, idx] = PENDING[id]; const sub = stamp(ago(Pd), 9); proj.submitted_at = iso(sub); proj.created_at = iso(addDays(sub, -ri(2, 8)));
    const r = pendingApproval(PSTAGES, pRev, sub, Pd, idx);
    ap = { subject_type: 'PROJECT', subject_id: id, subject_code: proj.code, subject_title: title, submitted_by: lead.id, submitted_at: proj.submitted_at, status: 'Pending', final_decided_at: null, stages: PSTAGES, decisions: r.decisions, current_stage: idx, current_stage_name: PSTAGES[idx], current_reviewer_id: pRev(idx), entered_stage_at: r.entered_stage_at };
  } else { proj.created_at = iso(stamp(ago(DRAFT_AGO[id] ?? 5), 11)); }
  if (ap) approvals.push(ap);
  projects.push(proj);
});
// force one overdue milestone for demo (project 21)
{ const m = projects[20].milestones.find(x => x.status !== 'Completed'); if (m) { m.due_date = dOnly(ago(5)); m.status = 'Overdue'; } }
// one late completion (project 14)
{ const m = projects[13].milestones.find(x => x.status === 'Completed'); if (m) { const d = addDays(new Date(m.due_date), 9); m.completed_at = dOnly(d > ago(1) ? ago(1) : d); } }

// ---------- IPR ----------
// [projectId, type, title, status, nextDeadlineDaysFromToday, deadlineType]
const IPR_ROWS = [
 [1,'Patent','Calibration Method for Low-Cost Particulate Sensors in Urban Networks','Granted',210,'Renewal fee'],
 [2,'Other','Modular Wetland Cell Layout for Apartment Greywater Reuse','Filed',30,'Publication / response'],
 [5,'Patent','Designed Antimicrobial Peptide Sequences with Reduced Host Toxicity','Under Examination',45,'Examination reply'],
 [6,'Patent','Method for Drought-Tolerance Editing in Millet Using Guide RNA Set','Draft',14,'Filing'],
 [7,'Patent','Lateral Flow Paper Assay Architecture for Dengue Antigen Detection','Granted',300,'Renewal fee'],
 [9,'Copyright','Plant Disease Explanation Toolkit Source Code','Filed',60,'Publication / response'],
 [11,'Copyright','Kannada Dialect Speech Corpus and Annotation Schema','Draft',25,'Filing'],
 [13,'Patent','Recycled Carbon Fibre Thermoplastic Panel Manufacturing Process','Under Examination',74,'Examination reply'],
 [14,'Patent','Encapsulated Phase Change Wall Panel for Passive Cooling','Approved for Filing',9,'Filing'],
 [17,'Patent','Humidity-Resistant Encapsulation Stack for Perovskite Cells','Under Evaluation',4,'Evaluation response'],
 [18,'Patent','Safety Monitoring Method for Repurposed Battery Packs','Draft',40,'Filing'],
 [19,'Trademark','BioGasMix Feedstock Optimiser Mark','Filed',120,'Publication / response'],
 [21,'Patent','Rhizobacterial Consortium Formulation for Pulse Water-Use Efficiency','Approved for Filing',2,'Filing'],
 [26,'Trademark','AdhereTB Mark','Under Evaluation',-6,'Evaluation response'],
];
const IPR_PENDING = { 17:[8,2], 26:[16,1], 18:[11,0] }; // by project id: [daysPending, stageIdx]
const iRev = k => [committee[1].id, null, committee[2].id][k]; // officer filled per record
const ipr = [];
IPR_ROWS.forEach((row, i) => {
  const [pid, type, title, status, dl, dlType] = row; const id = i + 1; const proj = projects[pid - 1];
  const officer = officers[i % 2]; const code = `IPR-${500 + id}`;
  const rev = k => k === 1 ? officer.id : iRev(k);
  const finalAgo = daysBetween(proj._final, TODAY);
  let createdAgo = IPR_PENDING[pid] ? IPR_PENDING[pid][0] + 1 : Math.max(status === 'Draft' ? 3 : 40, finalAgo - ri(8, 20));
  const created = stamp(ago(createdAgo), 9);
  const rec = { id, code, title, type, status, project_id: pid, department: proj.department, assigned_officer_id: officer.id,
    inventors: [proj.lead_researcher_id, proj.team[0].user_id], next_deadline: dOnly(addDays(TODAY, dl)), deadline_type: dlType,
    created_at: iso(created), filing_date: null, grant_date: null, application_ref: null, source: 'synthetic' };
  let ap = null;
  if (status !== 'Draft' && !IPR_PENDING[pid]) {
    const r = decided(ISTAGES, rev, created, { gmin: 3, gmax: 7 });
    ap = { subject_type: 'IPR', subject_id: id, subject_code: code, subject_title: title, submitted_by: officer.id, submitted_at: iso(created), status: 'Approved', final_decided_at: iso(stamp(r.finalDate)), stages: ISTAGES, decisions: r.decisions, current_stage: null, current_stage_name: null, current_reviewer_id: null };
    const filing = addDays(r.finalDate, ri(3, 10)); rec.filing_date = dOnly(filing);
    rec.application_ref = `DEMO-${type.slice(0, 3).toUpperCase()}-${filing.getUTCFullYear()}-${String(id).padStart(4, '0')}`;
    if (status === 'Granted') rec.grant_date = dOnly(addDays(filing, ri(200, 260)));
  } else if (IPR_PENDING[pid]) {
    const [Pd, idx] = IPR_PENDING[pid]; const sub = stamp(ago(Pd), 9);
    rec.created_at = iso(addDays(sub, -1));
    const r = pendingApproval(ISTAGES, rev, sub, Pd, idx);
    ap = { subject_type: 'IPR', subject_id: id, subject_code: code, subject_title: title, submitted_by: officer.id, submitted_at: iso(sub), status: 'Pending', final_decided_at: null, stages: ISTAGES, decisions: r.decisions, current_stage: idx, current_stage_name: ISTAGES[idx], current_reviewer_id: rev(idx), entered_stage_at: r.entered_stage_at };
  }
  if (ap) approvals.push(ap);
  ipr.push(rec);
});

// ---------- startups ----------
// [name, projectId, stage, mentorIdx|null, sector, description, appliedAgoOverride|null]
const SU = [
 ['AirWise Sensing',1,'Growth',0,'Environmental monitoring','Hyperlocal air quality data service built on calibrated low-cost sensor networks.',null],
 ['DenguDx Labs',7,'Seed',0,'Diagnostics','Paper-based rapid tests for mosquito-borne diseases aimed at primary health centres.',null],
 ['FibreLoop Composites',13,'Incubation',3,'Advanced materials','Recycled carbon fibre thermoplastic parts for automotive and consumer products.',null],
 ['TBTrack Care',26,'Incubation',0,'Digital health','Adherence tracking and reminders for community tuberculosis programmes.',null],
 ['LeafLens AI',9,'Incubation',1,'Agri-tech / AI','Explainable crop disease detection from phone photos for farmers and advisors.',null],
 ['BioGasMix Energy',19,'Seed',3,'Clean energy','Feedstock optimisation software and mixes for small biogas plants.',null],
 ['RootWell Agritech',21,'Under Review',null,'Agri-tech','Rhizobacterial inoculants that cut irrigation needs for pulse growers.',12],
 ['NovaCell Solar',17,'Applied',null,'Clean energy','Encapsulation materials that extend the humid-climate lifetime of perovskite solar modules.',3],
 ['ColourLeaf Naturals',24,'Graduated',2,'Food technology','Natural food colourants extracted from agricultural by-products.',null],
];
const SMS = ['Business model validated','Prototype built','Pilot customers onboarded','First revenue','Seed round closed'];
const MS_PLAN = { 'Applied':[3,0], 'Under Review':[3,0], 'Incubation':[4,null], 'Seed':[5,3], 'Growth':[5,4], 'Graduated':[5,5] };
const AGENDAS = ['Review go-to-market plan','Customer discovery debrief','Pricing and unit economics','Prototype test results','Funding strategy and pitch practice','Hiring and team roles'];
const ACTIONS = ['Interview five more target customers','Revise pricing model and share spreadsheet','Draft one-page pitch for funders','Book pilot site visit','Prepare compliance checklist','Shortlist two key hires'];
const startups = [], mentorAssignments = [], meetings = [];
SU.forEach((row, i) => {
  const [name, pid, stage, mi, sector, desc, override] = row; const id = i + 1; const proj = projects[pid - 1];
  const finalAgo = daysBetween(proj._final, TODAY);
  const appliedAgo = override ?? Math.max(3, finalAgo - 20);
  const applied = stamp(ago(appliedAgo), 10);
  const [total, doneFixed] = MS_PLAN[stage];
  const done = doneFixed ?? (i === 2 ? 1 : i === 3 ? 2 : 2);
  const ms = [];
  for (let k = 0; k < total; k++) {
    const isDone = k < done; let completed = null;
    if (isDone) { const span = Math.max(10, appliedAgo - 5); completed = dOnly(addDays(applied, Math.round(span * (k + 1) / (done + 1)))); if (new Date(completed) > ago(1)) completed = dOnly(ago(1)); }
    ms.push({ title: SMS[k] ?? `Milestone ${k + 1}`, status: isDone ? 'Completed' : 'Pending', completed_at: completed });
  }
  const su = { id, code: `SU-${100 + id}`, name, sector, description: desc, stage, project_id: pid, founder_id: proj.lead_researcher_id,
    mentor_id: mi === null ? null : mentors[mi].id, applied_at: iso(applied), milestones: ms, source: 'synthetic' };
  startups.push(su);
  // approvals
  const rev = k => k === 0 ? incMgr.id : committee[0].id;
  if (stage === 'Applied') { const r = pendingApproval(SSTAGES, rev, applied, 3, 0); approvals.push({ subject_type: 'STARTUP', subject_id: id, subject_code: su.code, subject_title: name, submitted_by: su.founder_id, submitted_at: iso(applied), status: 'Pending', final_decided_at: null, stages: SSTAGES, decisions: r.decisions, current_stage: 0, current_stage_name: SSTAGES[0], current_reviewer_id: rev(0), entered_stage_at: r.entered_stage_at }); }
  else if (stage === 'Under Review') { const r = pendingApproval(SSTAGES, rev, applied, 12, 1); approvals.push({ subject_type: 'STARTUP', subject_id: id, subject_code: su.code, subject_title: name, submitted_by: su.founder_id, submitted_at: iso(applied), status: 'Pending', final_decided_at: null, stages: SSTAGES, decisions: r.decisions, current_stage: 1, current_stage_name: SSTAGES[1], current_reviewer_id: rev(1), entered_stage_at: r.entered_stage_at }); }
  else { const r = decided(SSTAGES, rev, applied, { gmin: 3, gmax: 7 }); approvals.push({ subject_type: 'STARTUP', subject_id: id, subject_code: su.code, subject_title: name, submitted_by: su.founder_id, submitted_at: iso(applied), status: 'Approved', final_decided_at: iso(stamp(r.finalDate)), stages: SSTAGES, decisions: r.decisions, current_stage: null, current_stage_name: null, current_reviewer_id: null }); }
  // mentoring
  if (mi !== null) {
    const assigned = addDays(applied, ri(12, 20)); const a = daysBetween(assigned, TODAY);
    mentorAssignments.push({ id: mentorAssignments.length + 1, startup_id: id, mentor_id: mentors[mi].id, assigned_at: iso(assigned) });
    const n = stage === 'Growth' || stage === 'Graduated' ? 3 : 2;
    for (let k = 0; k < n; k++) {
      const d = addDays(assigned, Math.round((a - 4) * (k + 1) / n));
      const fu = addDays(d, 14);
      meetings.push({ id: meetings.length + 1, startup_id: id, mentor_id: mentors[mi].id, meeting_date: dOnly(d), agenda: AGENDAS[(i + k) % AGENDAS.length], notes: 'Discussed progress since last meeting and agreed next steps.', action_item: ACTIONS[(i + k * 2) % ACTIONS.length], follow_up_due: dOnly(fu), follow_up_done: fu < addDays(TODAY, -3) ? true : k < n - 1 });
    }
  }
});

// ---------- funding ----------
const oppFile = JSON.parse(fs.readFileSync(new URL('./funding-opportunities.seed.json', import.meta.url), 'utf8'));
const funding_opportunities = oppFile.opportunities.map((o, i) => ({ id: i + 1, ...o }));
// [type, entityId, oppIdx(0-based), reqL, apprL, recvL, status, appliedAgoOverride]
const FR = [
 ['project',5,6,35,28,14,'Approved'],['project',17,4,45,45,45,'Received'],['project',14,5,60,40,20,'Approved'],
 ['project',21,4,25,0,0,'Rejected'],['project',26,6,18,18,18,'Received'],['project',1,4,22,22,22,'Received'],
 ['project',7,6,30,30,30,'Received'],['project',9,4,20,0,0,'Applied',21],
 ['startup',1,0,50,50,50,'Received'],['startup',2,1,50,50,25,'Approved'],['startup',3,5,150,100,0,'Approved'],
 ['startup',4,0,50,0,0,'Applied',18],['startup',5,7,25,25,25,'Received'],['startup',6,2,10,10,10,'Received'],['startup',9,0,50,50,50,'Received'],
];
const clamp = d => d > ago(1) ? ago(1) : d;
const funding_records = FR.map((r, i) => {
  const [type, eid, oi, rq, ap, rc, status, ovr] = r;
  const base = type === 'project' ? new Date(projects[eid - 1].start_date) : new Date(startups[eid - 1].applied_at);
  const applied = ovr ? ago(ovr) : clamp(addDays(base, ri(type === 'project' ? 3 : 15, type === 'project' ? 20 : 40)));
  const approved = ap > 0 ? clamp(addDays(applied, ri(15, 35))) : null;
  const received = rc > 0 ? clamp(addDays(approved, ri(10, 25))) : null;
  const ent = type === 'project' ? projects[eid - 1] : startups[eid - 1];
  return { id: i + 1, entity_type: type, entity_id: eid, entity_code: ent.code, opportunity_id: oi + 1,
    requested_amount: rq * L, approved_amount: ap * L, received_amount: rc * L, currency: 'INR', status,
    applied_at: dOnly(applied), approved_at: approved ? dOnly(approved) : null, received_at: received ? dOnly(received) : null,
    remarks: status === 'Rejected' ? 'Not shortlisted in the latest call.' : '' };
});

// ---------- finalise approvals (ids + codes sorted by submission) ----------
approvals.sort((a, b) => a.submitted_at.localeCompare(b.submitted_at));
approvals.forEach((a, i) => { a.id = i + 1; a.code = `AR-${2000 + i + 1}`; });

// ---------- notifications & audit ----------
const notifications = [], audit_log = [];
const note = (user_id, type, title, message, entity, at, read) => notifications.push({ user_id, type, title, message, entity_type: entity[0], entity_code: entity[1], created_at: at, is_read: read });
const log = (user_id, action, etype, ecode, details, at) => audit_log.push({ user_id, action, entity_type: etype, entity_code: ecode, details, created_at: at });
for (const p of projects) {
  log(p.lead_researcher_id, 'CREATE', 'Project', p.code, `Created project "${p.title}"`, p.created_at);
  if (p.submitted_at) log(p.lead_researcher_id, 'SUBMIT', 'Project', p.code, 'Submitted for approval', p.submitted_at);
}
for (const a of approvals) {
  for (const d of a.decisions) log(d.reviewer_id, d.decision.toUpperCase().replace(' ', '_'), a.subject_type, a.subject_code, `${d.stage}: ${d.decision}. ${d.comment}`, d.decided_at);
  const daysOld = (a.final_decided_at ? daysBetween(new Date(a.final_decided_at), TODAY) : null);
  if (a.status === 'Pending') {
    const entered = a.entered_stage_at ?? a.submitted_at;
    note(a.current_reviewer_id, 'approval', `Approval ${a.code} awaiting your decision`, `${a.subject_code} - ${a.subject_title} is at "${a.current_stage_name}".`, [a.subject_type, a.subject_code], entered, false);
  } else {
    note(a.submitted_by, 'approval', `${a.code} ${a.status.toLowerCase()}`, `${a.subject_code} - ${a.subject_title} was ${a.status.toLowerCase()}.`, [a.subject_type, a.subject_code], a.final_decided_at, daysOld > 7);
  }
}
for (const r of ipr) {
  log(r.assigned_officer_id, 'CREATE', 'IPR', r.code, `Registered ${r.type} "${r.title}"`, r.created_at);
  const dd = daysBetween(TODAY, new Date(r.next_deadline));
  if (r.status !== 'Granted' && dd <= 30) note(r.assigned_officer_id, 'deadline', dd < 0 ? `${r.code} deadline overdue` : `${r.code} deadline in ${dd} day(s)`, `${r.deadline_type} for "${r.title}" is due ${r.next_deadline}.`, ['IPR', r.code], iso(stamp(ago(1), 8)), false);
}
for (const s of startups) log(s.founder_id, 'CREATE', 'Startup', s.code, `Startup application "${s.name}"`, s.applied_at);
for (const f of funding_records) log(incMgr.id, 'CREATE', 'Funding', f.entity_code, `Funding record ${f.status}: requested INR ${f.requested_amount}`, iso(stamp(new Date(f.applied_at), 11)));
for (const m of meetings) if (!m.follow_up_done) note(m.mentor_id, 'followup', 'Mentoring follow-up open', `Follow-up due ${m.follow_up_due}: ${m.action_item}`, ['Startup', startups[m.startup_id - 1].code], iso(stamp(ago(1), 8)), false);
audit_log.sort((a, b) => a.created_at.localeCompare(b.created_at));
notifications.sort((a, b) => a.created_at.localeCompare(b.created_at));
audit_log.forEach((x, i) => x.id = i + 1); notifications.forEach((x, i) => x.id = i + 1);
projects.forEach(p => delete p._final);

// ---------- validation ----------
const errs = []; const chk = (c, m) => { if (!c) errs.push(m); };
const now = new Date();
for (const f of funding_records) { chk(f.received_amount <= f.approved_amount && f.approved_amount <= f.requested_amount, `funding ${f.id} amounts`); chk(new Date(f.applied_at) <= now, `funding ${f.id} future date`); }
for (const a of approvals) {
  chk(new Date(a.submitted_at) <= now, `${a.code} submitted in future`);
  let prev = new Date(a.submitted_at);
  for (const d of a.decisions) { const t = new Date(d.decided_at); chk(t >= prev, `${a.code} decisions out of order`); chk(t <= now, `${a.code} decision in future`); chk(d.decision === 'Approved' || d.comment, `${a.code} missing comment`); prev = t; }
  if (a.status === 'Approved') chk(a.decisions.filter(d => d.decision === 'Approved').length === a.stages.length, `${a.code} approved without all stages`);
}
for (const p of projects) if (['Approved', 'Active', 'Completed'].includes(p.status)) chk(approvals.find(a => a.subject_type === 'PROJECT' && a.subject_id === p.id)?.status === 'Approved', `${p.code} status vs approval`);
for (const p of projects) if (p.status === 'Rejected') chk(approvals.find(a => a.subject_type === 'PROJECT' && a.subject_id === p.id)?.status === 'Rejected', `${p.code} rejected mismatch`);
for (const p of projects) if (p.status === 'Completed') chk(new Date(p.end_date) <= now, `${p.code} completed but end in future`);
const names = users.map(u => u.full_name); chk(new Set(names).size === names.length, 'duplicate names');
for (const r of ipr) { chk(projects[r.project_id - 1] && ['Approved', 'Active', 'Completed'].includes(projects[r.project_id - 1].status), `${r.code} on non-approved project`); if (r.grant_date) chk(new Date(r.grant_date) <= now, `${r.code} grant in future`); }
if (errs.length) { console.error('VALIDATION FAILED:\n' + errs.join('\n')); process.exit(1); }

// ---------- expected analytics ----------
const median = a => { const s = [...a].sort((x, y) => x - y); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const countBy = (arr, f) => arr.reduce((o, x) => { const k = f(x); o[k] = (o[k] ?? 0) + 1; return o; }, {});
const decidedA = approvals.filter(a => a.status !== 'Pending');
const procDays = decidedA.map(a => daysBetween(new Date(a.submitted_at), new Date(a.final_decided_at)));
const pend = approvals.filter(a => a.status === 'Pending').map(a => ({ code: a.code, subject: a.subject_type, stage: a.current_stage_name, days_pending: daysBetween(new Date(a.submitted_at), TODAY) }));
const projApprovedStatuses = ['Approved', 'Active', 'Completed'];
const expected = {
  generated_for_date: dOnly(TODAY),
  note: 'Dashboard numbers must match these when computed live from the loaded data. Dates are relative to the generation date; regenerate with the same SEED_TODAY to compare.',
  totals: { users: users.length, projects: projects.length, ipr_records: ipr.length, approvals: approvals.length, startups: startups.length, funding_opportunities: funding_opportunities.length, funding_records: funding_records.length, notifications: notifications.length, audit_entries: audit_log.length },
  projects_by_status: countBy(projects, p => p.status),
  completion_rate_pct: +(projects.filter(p => p.status === 'Completed').length / projects.length * 100).toFixed(1),
  output_by_department: Object.fromEntries(departments.map(d => { const ps = projects.filter(p => p.department === d.code); return [d.code, { projects: ps.length, approved_or_beyond: ps.filter(p => projApprovedStatuses.includes(p.status)).length, completed: ps.filter(p => p.status === 'Completed').length }]; })),
  approvals: { total: approvals.length, decided: decidedA.length, pending: pend.length, overdue_over_14_days: pend.filter(p => p.days_pending > 14).length,
    avg_processing_days: +(procDays.reduce((a, b) => a + b, 0) / procDays.length).toFixed(1), median_processing_days: median(procDays), n_for_average: procDays.length, pending_cases: pend },
  ipr_by_status: countBy(ipr, r => r.status), ipr_by_type: countBy(ipr, r => r.type),
  ipr_overdue_deadlines: ipr.filter(r => new Date(r.next_deadline) < TODAY).map(r => r.code),
  startups_by_stage: countBy(startups, s => s.stage),
  startup_progress: startups.map(s => ({ code: s.code, name: s.name, stage: s.stage, milestones_done: s.milestones.filter(m => m.status === 'Completed').length, milestones_total: s.milestones.length, progress_pct: Math.round(s.milestones.filter(m => m.status === 'Completed').length / s.milestones.length * 100) })),
  funding_totals_inr: { requested: funding_records.reduce((a, f) => a + f.requested_amount, 0), approved: funding_records.reduce((a, f) => a + f.approved_amount, 0), received: funding_records.reduce((a, f) => a + f.received_amount, 0) },
  funding_applications_by_status: countBy(funding_records, f => f.status),
};
const meta = { institution: 'Kaveri Institute of Science & Technology (FICTIONAL - check it is not a real institution before using publicly)', generated_for_date: dOnly(TODAY), currency: 'INR', note: 'Synthetic demo data. People, titles and workflow history are invented; funding opportunities are real scheme names that must be verified.' };
fs.writeFileSync(`${OUT}/seed-data.json`, JSON.stringify({ meta, departments, users, projects, approvals, ipr_records: ipr, startups, mentor_assignments: mentorAssignments, mentoring_meetings: meetings, funding_opportunities, funding_records, notifications, audit_log }, null, 2));
fs.writeFileSync(`${OUT}/expected-analytics.json`, JSON.stringify(expected, null, 2));
console.log('OK', JSON.stringify(expected.totals));
