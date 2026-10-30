// The 40 inputs of the research risk model, in one place.
// key = name the model was trained with (PhysioNet), field = name used in the API/database.
// source: vitals | lab_core | lab_extra | record | calculated | context
// Units were checked against the medians stored in the trained model.

const v = (key, field, label, unit, min, max, extra = {}) => ({ key, field, label, unit, min, max, ...extra });

export const MODEL_INPUTS = [
  // Vitals (entered on the Vitals tab)
  v('HR', 'heartRateBpm', 'Heart rate', 'beats/min', 0, 400, { source: 'vitals', group: 'Vitals' }),
  v('O2Sat', 'oxygenSaturationPercent', 'Oxygen saturation', '%', 0, 100, { source: 'vitals', group: 'Vitals' }),
  v('Temp', 'temperatureC', 'Temperature', '°C', 0, 60, { source: 'vitals', group: 'Vitals' }),
  v('SBP', 'systolicBpMmhg', 'Systolic blood pressure', 'mmHg', 0, 400, { source: 'vitals', group: 'Vitals' }),
  v('DBP', 'diastolicBpMmhg', 'Diastolic blood pressure', 'mmHg', 0, 300, { source: 'vitals', group: 'Vitals' }),
  v('Resp', 'respiratoryRateBpm', 'Breathing rate', '/min', 0, 200, { source: 'vitals', group: 'Vitals' }),
  v('MAP', null, 'Mean arterial pressure', 'mmHg', null, null, { source: 'calculated', group: 'Vitals', note: 'Worked out from systolic and diastolic pressure' }),

  // Core labs (required on every lab entry)
  v('Glucose', 'glucose', 'Glucose', 'mg/dL', 0, 2000, { source: 'lab_core', group: 'Core labs' }),
  v('Lactate', 'lactate', 'Lactate', 'mmol/L', 0, 50, { source: 'lab_core', group: 'Core labs' }),
  v('Creatinine', 'creatinine', 'Creatinine', 'mg/dL', 0, 100, { source: 'lab_core', group: 'Core labs' }),
  v('WBC', 'wbc', 'White cell count', '10⁹/L', 0, 1000, { source: 'lab_core', group: 'Core labs' }),
  v('Platelets', 'platelets', 'Platelets', '10⁹/L', 0, 10000, { source: 'lab_core', group: 'Core labs' }),

  // Optional labs
  v('EtCO2', 'etco2', 'End-tidal CO₂', 'mmHg', 0, 150, { source: 'lab_extra', group: 'Blood gas' }),
  v('BaseExcess', 'baseExcess', 'Base excess', 'mmol/L', -50, 50, { source: 'lab_extra', group: 'Blood gas' }),
  v('HCO3', 'hco3', 'Bicarbonate (HCO₃)', 'mmol/L', 0, 80, { source: 'lab_extra', group: 'Blood gas' }),
  v('FiO2', 'fio2', 'Inspired oxygen (FiO₂)', 'fraction, 0.21–1', 0, 1, { source: 'lab_extra', group: 'Blood gas' }),
  v('pH', 'ph', 'Blood pH', '', 6, 8, { source: 'lab_extra', group: 'Blood gas' }),
  v('PaCO2', 'paco2', 'Arterial CO₂ (PaCO₂)', 'mmHg', 0, 250, { source: 'lab_extra', group: 'Blood gas' }),
  v('SaO2', 'sao2', 'Arterial oxygen saturation (SaO₂)', '%', 0, 100, { source: 'lab_extra', group: 'Blood gas' }),

  v('BUN', 'bun', 'Blood urea nitrogen', 'mg/dL', 0, 300, { source: 'lab_extra', group: 'Chemistry' }),
  v('Calcium', 'calcium', 'Calcium', 'mg/dL', 0, 30, { source: 'lab_extra', group: 'Chemistry' }),
  v('Chloride', 'chloride', 'Chloride', 'mmol/L', 0, 200, { source: 'lab_extra', group: 'Chemistry' }),
  v('Magnesium', 'magnesium', 'Magnesium', 'mg/dL', 0, 20, { source: 'lab_extra', group: 'Chemistry' }),
  v('Phosphate', 'phosphate', 'Phosphate', 'mg/dL', 0, 30, { source: 'lab_extra', group: 'Chemistry' }),
  v('Potassium', 'potassium', 'Potassium', 'mmol/L', 0, 15, { source: 'lab_extra', group: 'Chemistry' }),

  v('AST', 'ast', 'AST', 'IU/L', 0, 20000, { source: 'lab_extra', group: 'Liver and heart' }),
  v('Alkalinephos', 'alkalinePhosphatase', 'Alkaline phosphatase', 'IU/L', 0, 5000, { source: 'lab_extra', group: 'Liver and heart' }),
  v('Bilirubin_direct', 'bilirubinDirect', 'Direct bilirubin', 'mg/dL', 0, 50, { source: 'lab_extra', group: 'Liver and heart' }),
  v('Bilirubin_total', 'bilirubinTotal', 'Total bilirubin', 'mg/dL', 0, 100, { source: 'lab_extra', group: 'Liver and heart' }),
  v('TroponinI', 'troponinI', 'Troponin I', 'ng/mL', 0, 1000, { source: 'lab_extra', group: 'Liver and heart' }),

  v('Hct', 'hct', 'Haematocrit', '%', 0, 100, { source: 'lab_extra', group: 'Blood count and clotting' }),
  v('Hgb', 'hgb', 'Haemoglobin', 'g/dL', 0, 30, { source: 'lab_extra', group: 'Blood count and clotting' }),
  v('PTT', 'ptt', 'Partial thromboplastin time (PTT)', 'seconds', 0, 300, { source: 'lab_extra', group: 'Blood count and clotting' }),
  v('Fibrinogen', 'fibrinogen', 'Fibrinogen', 'mg/dL', 0, 2000, { source: 'lab_extra', group: 'Blood count and clotting' }),

  // From the patient record
  v('Age', null, 'Age', 'years', null, null, { source: 'record', group: 'Patient record', note: 'Taken from the date of birth' }),
  v('Gender', null, 'Sex', '', null, null, { source: 'record', group: 'Patient record', note: 'Taken from sex at birth (male or female)' }),

  // Hospital context
  v('Unit1', null, 'Medical ICU', '', null, null, { source: 'context', group: 'Hospital context', note: 'Set by choosing the ICU type with a lab entry' }),
  v('Unit2', null, 'Surgical ICU', '', null, null, { source: 'context', group: 'Hospital context', note: 'Set by choosing the ICU type with a lab entry' }),
  v('HospAdmTime', null, 'Time since hospital admission', 'hours', null, null, { source: 'calculated', group: 'Hospital context', note: 'Worked out from the admission time' }),
  v('ICULOS', null, 'Time in ICU', 'hours', null, null, { source: 'context', group: 'Hospital context', note: 'Only exists once a patient is in an ICU bed, so it is blank while waiting' }),
];

export const EXTRA_LAB_INPUTS = MODEL_INPUTS.filter((item) => item.source === 'lab_extra');
export const CORE_LAB_INPUTS = MODEL_INPUTS.filter((item) => item.source === 'lab_core');
export const ICU_UNIT_TYPES = ['medical', 'surgical'];

// What the API sends to the frontend so forms and the checklist always match the model.
export function describeModelInputs() {
  return MODEL_INPUTS.map(({ key, field, label, unit, min, max, source, group, note }) => ({
    key, field, label, unit, min, max, source, group, note: note || '',
  }));
}
