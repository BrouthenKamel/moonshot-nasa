import type { ModelId } from '../assets/manifest'

/**
 * The Lunar Mapper 6U kit (assets-src/models/spacecraft_kit): sizes of the 51 parts and the
 * reference build's instances. GENERATED from the kit's parts.json and assembly_6u.json: do not
 * edit by hand. Units are metres; Y is up and +Z is the instrument end of the craft.
 */

export type Vec3 = [number, number, number]

export const KIT_PART_IDS = [
  'frame_6u',
  'face_panels',
  'deploy_switch',
  'separation_spring',
  'fasteners_kit',
  'obc_board',
  'eps_board',
  'battery_pack',
  'transceiver_board',
  'backplane',
  'transponder',
  'reaction_wheel',
  'rw_cluster',
  'star_tracker',
  'sun_sensor',
  'magnetorquer_set',
  'imu_box',
  'narrow_angle_camera',
  'ir_spectrometer',
  'laser_reflectometer',
  'neutron_spectrometer',
  'cold_gas_module',
  'green_monoprop_module',
  'ion_engine',
  'solar_wing',
  'solar_wing_mirror',
  'patch_antenna',
  'dish_antenna',
  'uhf_antenna',
  'mli_blanket',
  'radiator_panel',
  'heater_pads',
  'access_port_rbf',
  'deployer_6u_closed',
  'deployer_6u_open',
  'separation_ring',
  'payload_adapter_plate',
  'fairing_half',
  'lv_mount_plate',
  'assembly_stand',
  'crane_hook',
  'esd_workbench',
  'torque_wrench',
  'screwdriver',
  'shipping_container',
  'flight_covers',
  'rbf_tag',
  'laptop_cart',
  'witness_plate',
  'gse_umbilical_cable',
  'harness',
] as const
export type KitPartId = (typeof KIT_PART_IDS)[number]

export function kitModel(id: KitPartId): ModelId {
  return `model.sc-${id}` as ModelId
}

/** Bounds of each part in its own frame, with the subsystem and tier from the kit */
export const KIT_PARTS: Record<KitPartId, { min: Vec3; max: Vec3; tier: 1 | 2 | 3; subsystem: string }> = {
  frame_6u: { min: [-0.1132, -0.05, -0.183], max: [0.1132, 0.05, 0.183], tier: 1, subsystem: 'structure' },
  face_panels: { min: [-0.1074, -0.0432, -0.1767], max: [0.1074, 0.0432, 0.1767], tier: 1, subsystem: 'structure' },
  deploy_switch: { min: [-0.0025, -0.0025, -0.0095], max: [0.0025, 0.0025, -0.0003], tier: 1, subsystem: 'structure' },
  separation_spring: { min: [-0.0025, -0.0025, -0.0094], max: [0.0025, 0.0025, -0.0002], tier: 1, subsystem: 'structure' },
  fasteners_kit: { min: [-0.07, 0.0, -0.045], max: [0.07, 0.017, 0.045], tier: 1, subsystem: 'structure' },
  obc_board: { min: [-0.0451, -0.0136, -0.0479], max: [0.0451, 0.0119, 0.0479], tier: 1, subsystem: 'avionics' },
  eps_board: { min: [-0.0451, -0.0136, -0.0479], max: [0.0451, 0.0162, 0.0479], tier: 1, subsystem: 'power' },
  battery_pack: { min: [-0.0451, -0.0136, -0.0479], max: [0.0466, 0.0252, 0.0479], tier: 1, subsystem: 'power' },
  transceiver_board: { min: [-0.0451, -0.0136, -0.0479], max: [0.0451, 0.0132, 0.0479], tier: 1, subsystem: 'comms' },
  backplane: { min: [-0.046, -0.0034, -0.1], max: [0.046, 0.0102, 0.1], tier: 1, subsystem: 'avionics' },
  transponder: { min: [-0.04, 0.0, -0.052], max: [0.046, 0.0404, 0.0532], tier: 1, subsystem: 'comms' },
  reaction_wheel: { min: [-0.025, -0.0039, -0.025], max: [0.0312, 0.0235, 0.025], tier: 1, subsystem: 'attitude' },
  rw_cluster: { min: [-0.0309, -0.0039, -0.0309], max: [0.0333, 0.0325, 0.0333], tier: 1, subsystem: 'attitude' },
  star_tracker: { min: [-0.0234, 0.0, -0.0156], max: [0.022, 0.074, 0.0156], tier: 1, subsystem: 'attitude' },
  sun_sensor: { min: [-0.011, -0.0123, -0.0172], max: [0.011, 0.0052, 0.011], tier: 1, subsystem: 'attitude' },
  magnetorquer_set: { min: [-0.04, 0.0, -0.04], max: [0.04, 0.0135, 0.04], tier: 1, subsystem: 'attitude' },
  imu_box: { min: [-0.021, 0.0, -0.0132], max: [0.021, 0.0195, 0.0194], tier: 1, subsystem: 'attitude' },
  narrow_angle_camera: { min: [-0.028, -0.035, -0.0055], max: [0.0294, 0.023, 0.115], tier: 1, subsystem: 'payload' },
  ir_spectrometer: { min: [-0.0404, -0.027, -0.0029], max: [0.0495, 0.0347, 0.108], tier: 1, subsystem: 'payload' },
  laser_reflectometer: { min: [-0.045, -0.045, -0.002], max: [0.045, 0.045, 0.0665], tier: 1, subsystem: 'payload' },
  neutron_spectrometer: { min: [-0.042, 0.0, -0.0576], max: [0.042, 0.06, 0.048], tier: 1, subsystem: 'payload' },
  cold_gas_module: { min: [-0.048, 0.0, -0.0583], max: [0.048, 0.0525, 0.0475], tier: 1, subsystem: 'propulsion' },
  green_monoprop_module: { min: [-0.045, 0.0, -0.099], max: [0.045, 0.0602, 0.072], tier: 1, subsystem: 'propulsion' },
  ion_engine: { min: [-0.0555, -0.034, -0.0077], max: [0.0415, 0.0402, 0.1173], tier: 1, subsystem: 'propulsion' },
  solar_wing: { min: [-0.1955, -0.0032, -0.165], max: [0.5805, 0.0056, 0.165], tier: 1, subsystem: 'power' },
  solar_wing_mirror: { min: [-0.1955, -0.0056, -0.165], max: [0.5805, 0.0032, 0.165], tier: 1, subsystem: 'power' },
  patch_antenna: { min: [-0.025, -0.0092, -0.025], max: [0.025, 0.0048, 0.025], tier: 1, subsystem: 'comms' },
  dish_antenna: { min: [-0.076, 0.0, -0.076], max: [0.076, 0.13, 0.076], tier: 1, subsystem: 'comms' },
  uhf_antenna: { min: [-0.188, -0.0092, -0.0125], max: [0.188, 0.0065, 0.009], tier: 1, subsystem: 'comms' },
  mli_blanket: { min: [-0.0036, -0.0102, 0.0], max: [0.1022, 0.0846, 0.1335], tier: 1, subsystem: 'thermal' },
  radiator_panel: { min: [-0.0415, -0.0068, -0.1755], max: [0.0415, 0.0029, 0.1755], tier: 1, subsystem: 'thermal' },
  heater_pads: { min: [-0.055, 0.0, -0.0455], max: [0.055, 0.0036, 0.04], tier: 1, subsystem: 'thermal' },
  access_port_rbf: { min: [-0.016, -0.0144, -0.016], max: [0.016, 0.0053, 0.016], tier: 1, subsystem: 'power' },
  deployer_6u_closed: { min: [-0.13, -0.067, -0.219], max: [0.1439, 0.0615, 0.208], tier: 2, subsystem: 'launch' },
  deployer_6u_open: { min: [-0.2193, -0.067, -0.219], max: [0.1439, 0.0615, 0.44], tier: 2, subsystem: 'launch' },
  separation_ring: { min: [-0.208, -0.0376, -0.208], max: [0.208, 0.0376, 0.208], tier: 2, subsystem: 'launch' },
  payload_adapter_plate: { min: [-0.28, 0.0, -0.21], max: [0.28, 0.037, 0.21], tier: 2, subsystem: 'launch' },
  fairing_half: { min: [-0.6126, -0.003, -0.6044], max: [0.6126, 2.102, 0.0063], tier: 2, subsystem: 'launch' },
  lv_mount_plate: { min: [-0.45, -0.055, -0.45], max: [0.45, 0.05, 0.45], tier: 2, subsystem: 'launch' },
  assembly_stand: { min: [-0.5016, -0.0, -0.33], max: [0.33, 0.657, 0.4525], tier: 3, subsystem: 'cleanroom' },
  crane_hook: { min: [-0.3, -0.584, -0.22], max: [0.3, 1.2, 0.22], tier: 3, subsystem: 'cleanroom' },
  esd_workbench: { min: [-0.75, -0.0, -0.521], max: [0.75, 1.63, 0.375], tier: 3, subsystem: 'cleanroom' },
  torque_wrench: { min: [-0.015, -0.014, -0.015], max: [0.295, 0.0125, 0.015], tier: 3, subsystem: 'cleanroom' },
  screwdriver: { min: [-0.0096, -0.0, -0.0096], max: [0.0096, 0.158, 0.0096], tier: 3, subsystem: 'cleanroom' },
  shipping_container: { min: [-0.414, 0.0, -0.4403], max: [0.414, 0.7583, 0.2565], tier: 3, subsystem: 'cleanroom' },
  flight_covers: { min: [-0.0755, -0.0327, -0.1821], max: [0.1152, 0.0403, 0.185], tier: 3, subsystem: 'cleanroom' },
  rbf_tag: { min: [-0.0099, -0.312, -0.026], max: [0.086, 0.119, 0.026], tier: 3, subsystem: 'cleanroom' },
  laptop_cart: { min: [-0.31, 0.0, -0.3029], max: [0.3429, 1.1034, 0.245], tier: 3, subsystem: 'cleanroom' },
  witness_plate: { min: [-0.06, -0.0, -0.07], max: [0.06, 0.2455, 0.06], tier: 3, subsystem: 'cleanroom' },
  gse_umbilical_cable: { min: [-0.0939, 0.0, -0.0972], max: [0.406, 0.0167, 0.0892], tier: 3, subsystem: 'cleanroom' },
  harness: { min: [-0.0224, -0.0351, -0.1208], max: [0.0629, 0.009, 0.131], tier: 1, subsystem: 'avionics' },
}

/** The 6U envelope, centred on the origin */
export const ENVELOPE = { min: [-0.11315, -0.05, -0.183] as Vec3, max: [0.11315, 0.05, 0.183] as Vec3 }

export interface RefInstance {
  id: string
  part: KitPartId
  position: Vec3
  /** Euler XYZ, radians */
  rotation: Vec3
  /** Direction (unit) and distance (m) this part moves in the exploded view */
  explode: { dir: Vec3; dist: number }
  hidden?: string[]
}

/** The reference build: the whole craft, stowed */
export const REFERENCE_BUILD: RefInstance[] = [
  { id: 'frame', part: 'frame_6u', position: [0.0, 0.0, 0.0], rotation: [0.0, 0.0, 0.0], explode: { dir: [0.0, 0.0, 0.0], dist: 0.0 } },
  { id: 'panels', part: 'face_panels', position: [0.0, 0.0, 0.0], rotation: [0.0, 0.0, 0.0], explode: { dir: [0.0, 0.0, 0.0], dist: 0.0 }, hidden: ['panel_nx'] },
  { id: 'radiator', part: 'radiator_panel', position: [-0.1047, 0.0, 0.0], rotation: [0.0, 0.0, 1.5708], explode: { dir: [-1.0, 0.0, 0.0], dist: 0.09 } },
  { id: 'uhf', part: 'uhf_antenna', position: [-0.1063, 0.0, 0.124], rotation: [0.0, 0.0, 1.5708], explode: { dir: [-1.0, 0.0, 0.0], dist: 0.14 } },
  { id: 'patch', part: 'patch_antenna', position: [0.1061, -0.0, 0.105], rotation: [0.0, 0.0, -1.5708], explode: { dir: [1.0, 0.0, 0.0], dist: 0.13 } },
  { id: 'sun_sensor', part: 'sun_sensor', position: [0.1061, 0.02, -0.12], rotation: [0.0, 0.0, -1.5708], explode: { dir: [1.0, 0.0, 0.0], dist: 0.13 } },
  { id: 'wing_py', part: 'solar_wing', position: [0.096, 0.0443, 0.0], rotation: [0.0, 0.0, 0.0], explode: { dir: [0.0, 1.0, 0.0], dist: 0.14 } },
  { id: 'wing_ny', part: 'solar_wing_mirror', position: [-0.096, -0.0443, 0.0], rotation: [0.0, 3.1416, 0.0], explode: { dir: [0.0, -1.0, 0.0], dist: 0.14 } },
  { id: 'backplane', part: 'backplane', position: [-0.0515, -0.037, -0.038], rotation: [0.0, 0.0, 0.0], explode: { dir: [-0.2873, -0.9578, 0.0], dist: 0.07 } },
  { id: 'eps', part: 'eps_board', position: [-0.0515, -0.0218, 0.012], rotation: [0.0, 0.0, 0.0], explode: { dir: [-0.9701, 0.2425, 0.0], dist: 0.1 } },
  { id: 'obc', part: 'obc_board', position: [-0.0515, -0.0065, 0.012], rotation: [0.0, 0.0, 0.0], explode: { dir: [-0.8575, 0.5145, 0.0], dist: 0.13 } },
  { id: 'transceiver', part: 'transceiver_board', position: [-0.0515, 0.0087, 0.012], rotation: [0.0, 0.0, 0.0], explode: { dir: [-0.6247, 0.7809, 0.0], dist: 0.16 } },
  { id: 'battery', part: 'battery_pack', position: [-0.0515, -0.0218, -0.088], rotation: [0.0, 0.0, 0.0], explode: { dir: [-0.9407, 0.1881, -0.2822], dist: 0.11 } },
  { id: 'magnetorquers', part: 'magnetorquer_set', position: [-0.0515, 0.008, -0.088], rotation: [0.0, 0.0, 0.0], explode: { dir: [-0.3651, 0.9129, -0.1826], dist: 0.15 } },
  { id: 'imu', part: 'imu_box', position: [-0.035, 0.0205, 0.012], rotation: [0.0, 0.0, 0.0], explode: { dir: [0.0, 0.9806, 0.1961], dist: 0.2 } },
  { id: 'camera', part: 'narrow_angle_camera', position: [-0.0515, 0.0, 0.0655], rotation: [0.0, 0.0, 0.0], explode: { dir: [0.0, 0.1483, 0.9889], dist: 0.16 } },
  { id: 'ir_spectrometer', part: 'ir_spectrometer', position: [0.044, 0.0, 0.072], rotation: [0.0, 0.0, 0.0], explode: { dir: [0.0, 0.1483, 0.9889], dist: 0.16 } },
  { id: 'transponder', part: 'transponder', position: [0.052, -0.0404, 0.006], rotation: [0.0, 0.0, 0.0], explode: { dir: [0.8452, -0.5071, 0.169], dist: 0.12 } },
  { id: 'rw_cluster', part: 'rw_cluster', position: [0.055, 0.004, 0.0335], rotation: [0.0, 0.0, 0.0], explode: { dir: [0.4319, 0.8639, 0.2592], dist: 0.16 } },
  { id: 'star_tracker', part: 'star_tracker', position: [0.0387, 0.0155, -0.022], rotation: [0.0, 1.5708, -1.5708], explode: { dir: [0.9578, 0.2873, 0.0], dist: 0.18 } },
  { id: 'ion_engine', part: 'ion_engine', position: [0.056, -0.004, -0.1673], rotation: [0.0, 0.0, 0.0], explode: { dir: [0.0, 0.0, -1.0], dist: 0.16 } },
  { id: 'harness', part: 'harness', position: [0.0, 0.0, 0.0], rotation: [0.0, 0.0, 0.0], explode: { dir: [0.0, -1.0, 0.0], dist: 0.04 } },
  { id: 'access_port', part: 'access_port_rbf', position: [-0.06, -0.016, -0.1755], rotation: [-1.5708, 0.0, 0.0], explode: { dir: [0.0, 0.0, -1.0], dist: 0.1 } },
  { id: 'switch_a', part: 'deploy_switch', position: [0.1089, 0.0457, -0.183], rotation: [0.0, 3.1416, 0.0], explode: { dir: [0.0, 0.0, -1.0], dist: 0.05 } },
  { id: 'switch_b', part: 'deploy_switch', position: [-0.1089, -0.0457, -0.183], rotation: [0.0, 3.1416, 0.0], explode: { dir: [0.0, 0.0, -1.0], dist: 0.05 } },
  { id: 'spring_a', part: 'separation_spring', position: [-0.1089, 0.0457, 0.183], rotation: [0.0, 0.0, 0.0], explode: { dir: [0.0, 0.0, 1.0], dist: 0.05 } },
  { id: 'spring_b', part: 'separation_spring', position: [0.1089, -0.0457, 0.183], rotation: [0.0, 0.0, 0.0], explode: { dir: [0.0, 0.0, 1.0], dist: 0.05 } },
]
