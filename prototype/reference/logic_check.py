"""Lunar Ice Mapper - core-loop logic, reference model and end-to-end check.

Pure logic only (no UI). Every number is tagged in the spec as
S = sourced, D = derived from sourced numbers / physics, G = game value to tune.
Run:  python3 logic_check.py
"""
import math, random, copy

G0 = 9.80665            # m/s2
TURN_S = 30 * 86400     # one turn = one month
MU_MOON, R_MOON = 4902.8, 1737.4   # km3/s2, km

# ---------------------------------------------------------------- brief (fixed)
BRIEF = dict(ride_turn=8, ride_period=6, budget=25.0, vol_cap=6.0, mass_cap=14.0,
             cov_req=70.0, data_req=300.0, sci_turns_req=12, horizon=45)

CONST = dict(design_turns=1, integ_turns=1, effort_per_turn=10,
             team_pre=0.5, team_ops=0.3, test_cost=0.4, ride_fee=1.5,
             bus_mass=2.2, bus_cost=1.0, bus_effort=4, heater_w=3, dod=0.8,
             thrust_pointing=0.75, thrust_duty=0.6, cruise_turns=4,
             v_inf=0.85, tcm_direct=30, tcm_low=50, long_eclipse_h=3.0,
             margin_green=0.15, nav_cost_lowthrust=0.1, extend_max=12)

TEST_FACTOR = {0: 2.0, 1: 1.4, 2: 1.0, 3: 0.7}   # multiplies failure odds

# ---------------------------------------------------------------- catalogue
INSTR = {
    'laser':   dict(mass=2.0, vol=2.0, power=25, cost=2.5, effort=8, data=100,  sees_shadow=True,  h_max=20,  swath=0.025, kind='ice'),
    'neutron': dict(mass=2.5, vol=2.0, power=5,  cost=2.0, effort=6, data=30,   sees_shadow=True,  h_max=25,  swath=0.010, kind='ice'),
    'ir':      dict(mass=3.2, vol=1.5, power=12, cost=3.0, effort=9, data=400,  sees_shadow=False, h_max=None, swath=0.020, kind='context'),
    'camera':  dict(mass=0.5, vol=0.3, power=3,  cost=0.2, effort=2, data=1500, sees_shadow=False, h_max=None, swath=0.050, kind='outreach'),
}
ARRAY = {
    'small':  dict(mass=0.8, vol=0.0, gen=40,  cost=0.3, effort=2),
    'medium': dict(mass=1.3, vol=0.0, gen=84,  cost=0.6, effort=3),
    'large':  dict(mass=2.0, vol=0.0, gen=120, cost=1.0, effort=4),
}
BATT = {
    'small': dict(mass=0.3, vol=0.15, wh=40, cost=0.1, effort=1),
    'large': dict(mass=0.6, vol=0.30, wh=80, cost=0.2, effort=1),
}
PROP = {
    'none':     dict(dry=0.0, vol0=0.0, vol_per_kg=0.0, isp=0, cost=0.0, effort=0, impulsive=False, prop_max=0.0),
    'chemical': dict(dry=3.6, vol0=1.4, vol_per_kg=0.5, isp=150,  cost=2.5, effort=9,  impulsive=True,  prop_max=3.0),
    'electric': dict(dry=1.4, vol0=1.3, vol_per_kg=0.2, isp=2150, thrust=0.0011, p_min=56, p_nom=65, cost=3.0, effort=10, impulsive=False, prop_max=1.5),
}
RADIO = {
    'uhf':  dict(mass=0.2, vol=0.2, rx=1,  tx=5,  cost=0.1, effort=1, deep_space=False),
    'iris': dict(mass=1.1, vol=0.5, rx=10, tx=35, cost=1.5, effort=4, deep_space=True),
}
ANT = {
    'patch': dict(mass=0.1, vol=0.0, gain=1, cost=0.05, effort=1, needs_precise=False),
    'dish':  dict(mass=1.0, vol=1.5, gain=8, cost=0.80, effort=3, needs_precise=True),
}
COMP = {
    'basic': dict(mass=0.2, vol=0.2, power=3, cost=0.3, effort=2, storage=512,  reset=1.0),
    'rad':   dict(mass=0.4, vol=0.3, power=5, cost=0.9, effort=4, storage=4096, reset=0.3),
}
ADCS = {
    'basic':   dict(mass=0.5, vol=0.3, power=2, cost=0.3, effort=2, precise=False),
    'precise': dict(mass=0.9, vol=0.5, power=3, cost=0.8, effort=4, precise=True),
}
ORBIT = {   # all polar
    'nrho': dict(alt_pole=15,  passes=4.5, f_sun=1.00, eclipse_h=0.0, vis=0.95, sk=1.0,  obs_frac=0.01),
    'ell':  dict(alt_pole=15,  passes=141, f_sun=0.85, eclipse_h=0.6, vis=0.80, sk=5.0,  obs_frac=0.08),
    'circ': dict(alt_pole=100, passes=366, f_sun=0.60, eclipse_h=0.8, vis=0.60, sk=6.25, obs_frac=0.10),
}
ELL_APO = 3150            # km, far point of the elliptical orbit (LunaH-Map)
GROUND = {
    'own':       dict(rate=2,   max_h=6, price=0.01, outage=0.10),
    'partner21': dict(rate=64,  max_h=2, price=0.03, outage=0.06),
    'dsn34':     dict(rate=128, max_h=1, price=0.15, outage=0.02),
}

def visviva(r, a):
    return math.sqrt(MU_MOON * (2 / r - 1 / a))

def dv_insert(transfer, orbit, impulsive):
    """Delta-v (m/s) to get from the ride's drop-off into the science orbit."""
    if not impulsive:                                  # low thrust (electric)
        if transfer == 'direct':
            return None                                # cannot brake on a fast fly-by
        return {'nrho': 250, 'ell': 1000, 'circ': 1700}[orbit]
    if orbit == 'nrho':
        return 430 if transfer == 'direct' else 60
    r = R_MOON + ORBIT[orbit]['alt_pole']
    a = r if orbit == 'circ' else (2 * R_MOON + ORBIT[orbit]['alt_pole'] + ELL_APO) / 2
    v_orbit = visviva(r, a)
    v_esc = math.sqrt(2 * MU_MOON / r)
    if transfer == 'direct':
        v_arr = math.sqrt(CONST['v_inf'] ** 2 + v_esc ** 2)
        return round((v_arr - v_orbit) * 1000 + CONST['tcm_direct'])
    return round((v_esc - v_orbit) * 1000 + CONST['tcm_low'])

# ---------------------------------------------------------------- stages 1-7 (design)
def evaluate(d):
    """Deterministic design evaluation. d = dict of player choices. Returns all derived parameters."""
    o = {}
    ins = [INSTR[i] for i in d['instruments']]
    arr, bat, prop, rad, ant = ARRAY[d['array']], BATT[d['battery']], PROP[d['prop']], RADIO[d['radio']], ANT[d['antenna']]
    comp, adcs, orb, gnd = COMP[d['computer']], ADCS[d['adcs']], ORBIT[d['orbit']], GROUND[d['ground']]
    m_prop = min(d['prop_kg'], prop['prop_max'])

    # --- stage 3: mass, volume, power, cost, effort roll-ups
    parts = [arr, bat, rad, ant, comp, adcs] + ins
    o['m_dry'] = CONST['bus_mass'] + prop['dry'] + sum(p['mass'] for p in parts)
    o['m_wet'] = o['m_dry'] + m_prop
    o['volume'] = prop['vol0'] + prop['vol_per_kg'] * m_prop + sum(p['vol'] for p in parts)
    o['parts_cost'] = CONST['bus_cost'] + prop['cost'] + sum(p['cost'] for p in parts)
    o['effort'] = CONST['bus_effort'] + prop['effort'] + sum(p['effort'] for p in parts)
    o['p_gen'] = arr['gen']
    o['p_bus'] = comp['power'] + adcs['power'] + rad['rx'] + CONST['heater_w']
    o['p_instr'] = sum(i['power'] for i in ins)
    o['p_txnet'] = rad['tx'] - rad['rx']
    o['storage'] = comp['storage']

    # --- stage 1: schedule and money pots
    o['build_turns'] = math.ceil(o['effort'] / CONST['effort_per_turn'])
    o['ready_turn'] = CONST['design_turns'] + o['build_turns'] + d['test_turns'] + CONST['integ_turns']
    o['slack'] = BRIEF['ride_turn'] - o['ready_turn']
    o['test_factor'] = TEST_FACTOR[d['test_turns']]
    o['reserve'] = BRIEF['budget'] * d['reserve_frac']
    o['spendable'] = BRIEF['budget'] - o['reserve']

    # --- stage 5: delta-v and transfer
    o['dv_avail'] = prop['isp'] * G0 * math.log(o['m_wet'] / o['m_dry']) if m_prop > 0 else 0.0
    o['dv_insert'] = dv_insert(d['transfer'], d['orbit'], prop['impulsive']) if d['prop'] != 'none' else None
    p_thr = o['p_gen'] * CONST['thrust_pointing'] - o['p_bus']
    o['thrust_level'] = 1.0 if prop['impulsive'] else (0.0 if (d['prop'] == 'none' or p_thr < prop['p_min']) else min(1.0, p_thr / prop['p_nom']))
    if o['dv_insert'] is None or o['thrust_level'] == 0:
        o['transfer_turns'] = None
    elif prop['impulsive']:
        o['transfer_turns'] = 0 if d['transfer'] == 'direct' else CONST['cruise_turns']
    else:
        m_avg = o['m_wet'] - m_prop / 2
        spiral = max(0, o['dv_insert'] - 100) * m_avg / (prop['thrust'] * o['thrust_level'] * CONST['thrust_duty'] * TURN_S)
        o['transfer_turns'] = CONST['cruise_turns'] + math.ceil(spiral)
    o['dv_sk_turn'] = orb['sk']
    o['dv_after_insert'] = o['dv_avail'] - (o['dv_insert'] or 0)
    o['sk_turns'] = math.floor(o['dv_after_insert'] / orb['sk']) if o['dv_after_insert'] >= 0 else 0

    # --- stage 6: link
    pointing_ok = adcs['precise'] or not ant['needs_precise']
    o['link_kbps'] = (gnd['rate'] * ant['gain'] * (1.0 if pointing_ok else 0.25)) if rad['deep_space'] else 0.0
    h_day = min(d['contact_h'], gnd['max_h'])
    o['contact_h'] = h_day
    o['ground_cost_turn'] = h_day * gnd['price']
    o['c_power'] = max(0.0, min(1.0, (o['p_gen'] - o['p_bus']) / o['p_txnet'])) if o['p_txnet'] > 0 else 1.0
    o['downlink_cap'] = o['link_kbps'] * h_day * 30 * 3600 / 8 / 1000 * orb['vis'] * o['c_power']   # MB per turn

    # --- stages 2+4: science rates
    s_inst = max(0.0, min(1.0, (o['p_gen'] - o['p_bus']) / o['p_instr'])) if o['p_instr'] > 0 else 0.0
    avg_left = o['p_gen'] * orb['f_sun'] - o['p_bus'] - o['p_txnet'] * (h_day / 24) * o['c_power']
    s_avg = max(0.0, min(1.0, avg_left / (o['p_instr'] * orb['obs_frac']))) if o['p_instr'] > 0 else 0.0
    o['sci_duty'] = min(s_inst, s_avg)
    o['power_margin'] = o['p_gen'] * orb['f_sun'] - (o['p_bus'] + o['p_instr'] * orb['obs_frac'] + o['p_txnet'] * h_day / 24)
    o['batt_need'] = (o['p_bus'] + o['p_instr']) * orb['eclipse_h']
    o['batt_ok'] = bat['wh'] * CONST['dod'] >= o['batt_need']
    o['batt_long_ok'] = bat['wh'] * CONST['dod'] >= o['p_bus'] * CONST['long_eclipse_h']
    o['rate'], o['data_turn'] = {}, 0.0
    for name in d['instruments']:
        i = INSTR[name]
        q = 1.0 if (i['h_max'] is None or orb['alt_pole'] <= i['h_max']) else (i['h_max'] / orb['alt_pole']) ** 2
        if name == 'laser' and not adcs['precise']:
            q *= 0.5
        o['rate'][name] = 1 - math.exp(-orb['passes'] * i['swath'] * q * o['sci_duty'])   # share of unmapped area per turn
        o['data_turn'] += i['data'] * o['sci_duty']

    # --- stage 7: projection of a clean 12-turn science phase + budget
    o['launch_turn'] = BRIEF['ride_turn'] if o['slack'] >= 0 else None
    tt = o['transfer_turns'] if o['transfer_turns'] is not None else 0
    o['ops_cost_turn'] = CONST['team_ops'] + o['ground_cost_turn']
    o['cost_prelaunch'] = o['parts_cost'] + CONST['team_pre'] * BRIEF['ride_turn'] + CONST['test_cost'] * d['test_turns'] + CONST['ride_fee']
    o['transfer_cost_turn'] = o['ops_cost_turn'] + (0 if prop['impulsive'] else CONST['nav_cost_lowthrust'])
    o['cost_total'] = o['cost_prelaunch'] + o['transfer_cost_turn'] * tt + o['ops_cost_turn'] * BRIEF['sci_turns_req']
    proj = project(d, o, BRIEF['sci_turns_req'])
    o.update(proj)

    # --- Go / No-Go
    g = CONST['margin_green']
    def band(margin):          # margin is a fraction of the limit
        return 'green' if margin >= g else ('yellow' if margin >= 0 else 'red')
    chk = {}
    chk['volume'] = band((BRIEF['vol_cap'] - o['volume']) / BRIEF['vol_cap'])
    chk['mass'] = band((BRIEF['mass_cap'] - o['m_wet']) / BRIEF['mass_cap'])
    chk['time'] = 'red' if o['slack'] < 0 else ('yellow' if o['slack'] == 0 else 'green')
    if o['dv_insert'] is None or o['thrust_level'] == 0 or o['dv_avail'] < (o['dv_insert'] or 0):
        chk['propulsion'] = 'red'
    else:
        need = o['dv_insert'] + orb['sk'] * BRIEF['sci_turns_req']
        chk['propulsion'] = band((o['dv_avail'] - need) / need)
    chk['power'] = 'red' if (o['sci_duty'] <= 0 or not o['batt_ok']) else ('yellow' if (o['sci_duty'] < 1 or not o['batt_long_ok'] or o['power_margin'] < g * o['p_gen']) else 'green')
    chk['comms'] = 'red' if o['downlink_cap'] <= 0 else ('yellow' if o['c_power'] < 1 else 'green')
    chk['data'] = 'red' if (o['downlink_cap'] <= 0 or o['data_turn'] <= 0) else ('green' if o['downlink_cap'] >= o['data_turn'] * (1 + g) else 'yellow')
    chk['budget'] = 'green' if o['cost_total'] <= o['spendable'] else ('yellow' if o['cost_total'] <= BRIEF['budget'] else 'red')
    chk['science'] = 'green' if (o['proj_cov'] >= BRIEF['cov_req'] and o['proj_data'] >= BRIEF['data_req']) else 'yellow'
    o['checks'] = chk
    o['go'] = all(v != 'red' for v in chk.values())
    return o

def new_science_state(d):
    return dict(observed={n: 0.0 for n in d['instruments']}, pending={n: 0.0 for n in d['instruments']},
                mapped={n: 0.0 for n in d['instruments']}, stored=0.0, stored_by={n: 0.0 for n in d['instruments']},
                returned={n: 0.0 for n in d['instruments']}, lost=0.0)

def science_turn(d, o, st, duty_factor=1.0, cap_factor=1.0, gen_factor=1.0):
    """One turn of observing + downlink. Coverage only counts once its data is on the ground."""
    avail_by = {}
    for n in d['instruments']:
        rate = 1 - (1 - o['rate'][n]) ** duty_factor if duty_factor != 1.0 else o['rate'][n]
        rate *= gen_factor
        new_cov = (100 - st['observed'][n]) * rate
        st['observed'][n] += new_cov
        st['pending'][n] += new_cov
        avail_by[n] = st['stored_by'][n] + INSTR[n]['data'] * o['sci_duty'] * duty_factor * gen_factor
    avail = sum(avail_by.values())
    cap = o['downlink_cap'] * cap_factor
    sent = min(avail, cap)
    keep = min(avail - sent, o['storage'])
    lost = avail - sent - keep
    f_sent, f_keep = (sent / avail, keep / avail) if avail > 0 else (0.0, 0.0)
    for n in d['instruments']:
        st['returned'][n] += avail_by[n] * f_sent
        st['stored_by'][n] = avail_by[n] * f_keep
        credited = st['pending'][n] * f_sent
        dropped = st['pending'][n] * (1 - f_sent - f_keep)
        st['mapped'][n] += credited
        st['pending'][n] -= credited + dropped
        st['observed'][n] -= dropped            # lost data means that ground must be observed again
    st['stored'] = keep
    st['lost'] += lost
    return st

def summarize(d, st):
    ice = [n for n in d['instruments'] if INSTR[n]['sees_shadow']]
    cov = max([st['mapped'][n] for n in ice], default=0.0)
    sci = sum(st['returned'][n] for n in d['instruments'] if INSTR[n]['kind'] != 'outreach')
    ctx = max([st['mapped'][n] for n in d['instruments'] if INSTR[n]['kind'] == 'context'], default=0.0)
    out = sum(st['returned'][n] for n in d['instruments'] if INSTR[n]['kind'] == 'outreach')
    return cov, sci, ctx, out

def project(d, o, turns):
    st = new_science_state(d)
    for _ in range(min(turns, o['sk_turns']) if o['dv_insert'] is not None else 0):
        science_turn(d, o, st)
    cov, sci, ctx, out = summarize(d, st)
    return dict(proj_cov=cov, proj_data=sci, proj_context=ctx, proj_outreach=out, proj_lost=st['lost'])

# ---------------------------------------------------------------- stage 8: simulation
def simulate(d, rng, events=True):
    o = evaluate(d)
    log = []
    if not o['go']:
        return dict(level='no-go', score=0, log=['No-Go: ' + ', '.join(k for k, v in o['checks'].items() if v == 'red')], o=o)
    main, reserve = o['spendable'] - o['parts_cost'], o['reserve']
    k = o['test_factor']
    comp = COMP[d['computer']]
    orb = ORBIT[d['orbit']]
    st = new_science_state(d)
    turn, phase = 0, 'build'
    build_left = CONST['design_turns'] + o['build_turns'] + d['test_turns'] + CONST['integ_turns']
    launch_turn = BRIEF['ride_turn']
    transfer_left, dv_left = o['transfer_turns'], o['dv_avail']
    thrust_ok, captured, alive, sci_turns, gen_factor = True, False, True, 0, 1.0
    cov_now = sci_now = 0.0
    end = 'horizon'

    def pay(amount):
        nonlocal main, reserve
        main -= amount
        if main < 0:
            reserve += main
            main = 0.0
        return reserve >= 0

    pay(CONST['test_cost'] * d['test_turns'])
    while turn < BRIEF['horizon'] and alive:
        turn += 1
        if phase == 'build':
            ok = pay(CONST['team_pre'])
            if events and build_left > 0 and rng.random() < 0.08 * (o['effort'] / 35):
                build_left += 1
                log.append(f't{turn}: build delay, +1 turn')
            build_left -= 1
            if turn == launch_turn:
                if build_left <= 0:
                    pay(CONST['ride_fee'])
                    phase = 'transfer'
                    log.append(f't{turn}: launched on the ride')
                    if events and rng.random() < 0.08 * k * comp['reset']:
                        if reserve >= 0.5 and rng.random() < 0.6:
                            reserve -= 0.5
                            log.append(f't{turn}: no signal after deployment, recovered with extra tracking (reserve -0.5)')
                        else:
                            alive, end = False, 'lost contact after deployment'
                    if transfer_left == 0:
                        dv_left -= o['dv_insert']
                        captured, phase = True, 'science'
                        log.append(f't{turn}: direct capture into {d["orbit"]}')
                else:
                    launch_turn += BRIEF['ride_period']
                    log.append(f't{turn}: missed the ride, next one on turn {launch_turn}')
            if not ok:
                alive, end = False, 'budget ran out before launch'
        elif phase == 'transfer':
            if not pay(o['transfer_cost_turn']):
                alive, end = False, 'budget ran out during transfer'
                break
            if events and thrust_ok and rng.random() < 0.03 * k:
                if reserve >= 1.0 and rng.random() < 0.5:
                    reserve -= 1.0
                    transfer_left += 1
                    log.append(f't{turn}: thruster underperforming, fixed (reserve -1.0, +1 turn)')
                else:
                    thrust_ok = False
                    if PROP[d['prop']]['impulsive']:
                        dv_left *= 0.5
                        log.append(f't{turn}: thruster underperforming, delta-v halved')
                    else:
                        transfer_left *= 2
                        log.append(f't{turn}: thruster underperforming, transfer takes twice as long')
            transfer_left -= 1
            if transfer_left <= 0:
                if dv_left >= o['dv_insert']:
                    dv_left -= o['dv_insert']
                    captured, phase = True, 'science'
                    log.append(f't{turn}: captured into {d["orbit"]}')
                else:
                    alive, end = False, 'not enough delta-v left to capture'
        elif phase == 'science':
            if not pay(o['ops_cost_turn']):
                alive, end = False, 'budget ran out in orbit'
                break
            duty, cap = 1.0, 1.0
            if events:
                if rng.random() < 0.06 * comp['reset']:
                    duty = 0.0
                    log.append(f't{turn}: radiation reset, safe mode this turn')
                if rng.random() < GROUND[d['ground']]['outage']:
                    cap = 0.5
                    log.append(f't{turn}: ground station outage, half the contact time')
                if rng.random() < 0.05 and not o['batt_long_ok']:
                    duty = 0.0
                    log.append(f't{turn}: long eclipse drained the battery, safe mode')
                if rng.random() < 0.03 * k:
                    gen_factor *= 0.8
                    log.append(f't{turn}: instrument degraded, 20% less science per turn')
            science_turn(d, o, st, duty, cap, gen_factor)
            sci_turns += 1
            dv_left -= orb['sk']
            if dv_left < 0:
                alive, end = False, 'out of propellant, orbit lost'
            prev_cov, prev_sci = cov_now, sci_now
            cov_now, sci_now, ctx, out = summarize(d, st)
            if sci_turns >= BRIEF['sci_turns_req']:
                if cov_now >= BRIEF['cov_req'] and sci_now >= BRIEF['data_req']:
                    end = 'all requirements met'
                    break
                progressing = (cov_now < BRIEF['cov_req'] and cov_now - prev_cov > 0.5) or (sci_now < BRIEF['data_req'] and sci_now - prev_sci > 1)
                if not progressing or sci_turns >= BRIEF['sci_turns_req'] + CONST['extend_max']:
                    end = 'primary mission over'
                    break
    cov, sci, ctx, out = summarize(d, st)
    money_left = main + max(reserve, 0)
    req = dict(capture=captured, coverage=cov >= BRIEF['cov_req'], data=sci >= BRIEF['data_req'],
               lifetime=sci_turns >= BRIEF['sci_turns_req'], budget=reserve >= 0)
    if all(req.values()):
        level = 'full'
    elif captured and (cov >= BRIEF['cov_req'] / 2 or sci >= BRIEF['data_req'] / 2):
        level = 'partial'
    else:
        level = 'fail'
    score = (40 * min(1, cov / BRIEF['cov_req']) + 25 * min(1, sci / BRIEF['data_req'])
             + 15 * min(1, sci_turns / BRIEF['sci_turns_req']) + 10 * min(1, ctx / BRIEF['cov_req'])
             + 10 * max(0, money_left) / BRIEF['budget']) * (1.0 if captured else 0.0)
    return dict(level=level, score=round(score, 1), req=req, cov=round(cov, 1), data=round(sci), context=round(ctx, 1),
                outreach=round(out), sci_turns=sci_turns, turns=turn, money_left=round(money_left, 2), end=end, log=log, o=o)

# ---------------------------------------------------------------- archetypes and checks
BASE = dict(test_turns=2, reserve_frac=0.10, instruments=['laser'], array='medium', battery='large', prop='chemical',
            prop_kg=2.0, radio='iris', antenna='patch', computer='basic', adcs='precise', orbit='nrho',
            transfer='low', ground='partner21', contact_h=1.0)

def mk(**kw):
    d = copy.deepcopy(BASE)
    d.update(kw)
    return d

ARCH = {
    'A Flashlight-like (chemical, halo loop, laser)': mk(),
    'B LunaH-Map-like (electric, elliptical, neutron)': mk(instruments=['neutron'], array='large', prop='electric', prop_kg=1.5, orbit='ell', adcs='basic'),
    'C IceCube-like (electric, elliptical, IR only)': mk(instruments=['ir'], array='large', prop='electric', prop_kg=1.5, orbit='ell', adcs='basic', test_turns=1),
    'D Greedy (laser+IR+camera+dish)': mk(instruments=['laser', 'ir', 'camera'], antenna='dish'),
    'E LEO habits (UHF radio, own dish)': mk(radio='uhf', ground='own', contact_h=6),
    'F Impatient (chemical, direct, low circular)': mk(orbit='circ', transfer='direct', prop_kg=3.0),
    'G Electric to low circular (IR+neutron)': mk(instruments=['neutron', 'camera'], array='large', prop='electric', prop_kg=1.5, orbit='circ', computer='rad', test_turns=1),
    'H Electric but medium panels': mk(instruments=['neutron'], array='medium', prop='electric', prop_kg=1.5, orbit='ell'),
    'I Laser + small battery': mk(battery='small', orbit='ell', prop='electric', array='large', prop_kg=1.5, test_turns=1),
    'J Light chemical to elliptical (neutron, 3 kg tank)': mk(instruments=['neutron'], prop_kg=3.0, orbit='ell', array='small', battery='small', computer='basic', adcs='basic'),
    'K No testing, no reserve': mk(test_turns=0, reserve_frac=0.0),
    'L Camera tourist': mk(instruments=['camera'], ground='own', contact_h=6),
    'M No propulsion, DSN': mk(prop='none', prop_kg=0.5, ground='dsn34', contact_h=1),
    'O Laser on the team\'s own dish (tight link)': mk(ground='own', contact_h=6, computer='basic'),
    'P Three test turns, camera only': mk(instruments=['camera'], test_turns=3, battery='small', adcs='basic'),
    'Q Dish with basic pointing': mk(instruments=['camera'], antenna='dish', adcs='basic', battery='small'),
    'R Rad-hard computer': mk(computer='rad', battery='small'),
    'S Neutron on the halo loop (too few passes)': mk(instruments=['neutron'], prop='electric', array='large', prop_kg=1.0, adcs='basic', test_turns=0, ground='own', contact_h=1),
    'T Laser+camera, partner dish (tight link)': mk(instruments=['laser', 'camera'], battery='small', adcs='basic', contact_h=6),
    'U Laser+camera, DSN half hour a day': mk(instruments=['laser', 'camera'], battery='small', adcs='basic', ground='dsn34', contact_h=0.5),
    'N Electric halo loop, laser+camera, DSN': mk(instruments=['laser', 'camera'], array='large', prop='electric', prop_kg=1.0, ground='dsn34', contact_h=1),
}

CHOICES = dict(test_turns=[0, 1, 2, 3], reserve_frac=[0, 0.05, 0.10, 0.15, 0.20],
               instruments=[['laser'], ['neutron'], ['ir'], ['camera'], ['laser', 'camera'], ['neutron', 'ir']],
               array=list(ARRAY), battery=list(BATT), prop=list(PROP), prop_kg=[0.5, 1.0, 1.5, 2.0, 3.0],
               radio=list(RADIO), antenna=list(ANT), computer=list(COMP), adcs=list(ADCS), orbit=list(ORBIT),
               transfer=['direct', 'low'], ground=list(GROUND), contact_h=[0.5, 1, 2, 6])

def flat(x):
    if isinstance(x, dict):
        return tuple(sorted((k, flat(v)) for k, v in x.items()))
    if isinstance(x, list):
        return tuple(flat(v) for v in x)
    return round(x, 6) if isinstance(x, float) else x

if __name__ == '__main__':
    print('== delta-v table (m/s) ==')
    for imp, label in ((True, 'impulsive'), (False, 'low-thrust')):
        for tr in ('direct', 'low'):
            print(f'  {label:10s} {tr:6s}', {ob: dv_insert(tr, ob, imp) for ob in ORBIT})

    print('\n== archetypes: design check, then 3000 simulated missions each ==')
    for name, d in ARCH.items():
        o = evaluate(d)
        red = [k for k, v in o['checks'].items() if v == 'red']
        yel = [k for k, v in o['checks'].items() if v == 'yellow']
        tt = o['transfer_turns']
        print(f"\n{name}\n  mass {o['m_wet']:.1f}/14 kg  vol {o['volume']:.2f}/6 U  build {o['build_turns']}t slack {o['slack']}  "
              f"dv {o['dv_avail']:.0f} vs insert {o['dv_insert']}  transfer {tt}t  duty {o['sci_duty']:.2f}  "
              f"link {o['downlink_cap']:.0f} vs data {o['data_turn']:.0f} MB/t  cost {o['cost_total']:.1f} of {o['spendable']:.1f}"
              f"\n  projection: coverage {o['proj_cov']:.0f}%  data {o['proj_data']:.0f} MB  | GO={o['go']}  red={red}  yellow={yel}")
        if o['go']:
            rng = random.Random(7)
            res = [simulate(d, rng) for _ in range(3000)]
            n = len(res)
            lv = {l: sum(r['level'] == l for r in res) * 100 // n for l in ('full', 'partial', 'fail')}
            clean = simulate(d, random.Random(1), events=False)
            print(f"  no-event run: {clean['level']}, score {clean['score']}, {clean['turns']} turns, end: {clean['end']}"
                  f"\n  with events: {lv}  mean score {sum(r['score'] for r in res) / n:.0f}")

    print('\n== every player choice changes at least one result ==')
    refs = [ARCH[k] for k in ARCH if k[0] in 'ABG']
    for key, opts in CHOICES.items():
        seen = set()
        for ref in refs:
            for v in opts:
                d = copy.deepcopy(ref)
                d[key] = v
                o = evaluate(d)
                seen.add(flat({k: o[k] for k in ('checks', 'proj_cov', 'proj_data', 'cost_total', 'transfer_turns', 'slack', 'reserve', 'test_factor', 'proj_outreach', 'proj_context', 'proj_lost')}))
        print(f'  {key:13s} {len(opts)} options -> {len(seen)} distinct outcomes', 'OK' if len(seen) > 1 else 'NO EFFECT')

    print('\n== exhaustive design-space sweep (testing 2 turns, reserve 10%) ==')
    import itertools
    keys = [k for k in CHOICES if k not in ('test_turns', 'reserve_frac')]
    tot = go = full = 0
    fam = {}
    for combo in itertools.product(*[CHOICES[k] for k in keys]):
        d = dict(zip(keys, combo), test_turns=2, reserve_frac=0.10)
        d['instruments'] = list(d['instruments'])
        if d['prop'] == 'none' and d['prop_kg'] != 0.5:
            continue
        o = evaluate(d)
        tot += 1
        if o['go']:
            go += 1
            ok = o['proj_cov'] >= 70 and o['proj_data'] >= 300 and o['sk_turns'] >= 12 and o['checks']['budget'] != 'red'
            key = (d['prop'], d['orbit'], '+'.join(d['instruments']))
            f = fam.setdefault(key, [0, 0, 1e9])
            f[0] += 1
            if ok:
                full += 1
                f[1] += 1
                f[2] = min(f[2], o['cost_total'])
    print(f'  designs checked: {tot}; pass Go/No-Go: {go} ({go * 100 / tot:.1f}%); projected to meet every requirement: {full} ({full * 100 / tot:.2f}%)')
    print('  families that can meet every requirement (propulsion, orbit, instruments: winning designs, cheapest total cost):')
    for key, f in sorted(fam.items(), key=lambda kv: kv[1][2]):
        if f[1]:
            print(f'    {key[0]:9s} {key[1]:5s} {key[2]:15s} {f[1]:5d}  from {f[2]:.1f}')
    print('  families that pass Go/No-Go but cannot meet every requirement:', sorted({k for k, f in fam.items() if not f[1]}))

    print('\n== real-mission anchors reproduced by the formulas ==')
    e = PROP['electric']
    print(f"  ion engine, 14 kg craft, 1.5 kg iodine: {e['isp'] * G0 * math.log(14 / 12.5):.0f} m/s (maker says up to 2390)")
    c = PROP['chemical']
    print(f"  chemical module, 2 kg propellant: {c['isp'] * G0 * 2:.0f} N s total impulse (Lunar Flashlight: over 3000), {c['vol0'] + 2 * c['vol_per_kg']:.1f} U (real: 2.5), {c['dry'] + 2:.1f} kg wet (real: under 6)")
    print(f"  ion module with 1.5 kg iodine: {e['vol0'] + 1.5 * e['vol_per_kg']:.1f} U and {e['dry'] + 1.5:.1f} kg (real: 1.6 U, 2.9 kg)")
    print(f"  direct insertion into a 100 km circular orbit: {dv_insert('direct', 'circ', True)} m/s (LRO 854 to 50 km, Lunar Prospector 898 to 100 km)")
    ob = evaluate(ARCH['B LunaH-Map-like (electric, elliptical, neutron)'])
    oc = evaluate(ARCH['C IceCube-like (electric, elliptical, IR only)'])
    print(f"  electric transfer to the elliptical orbit: {ob['transfer_turns']} months (Lunar IceCube plan about 9, LunaH-Map plan about 15)")
    print(f"  IceCube-like build: {oc['m_wet']:.1f} kg (real 14), total cost {oc['cost_total']:.1f} (real mission about 24 million dollars)")
    print(f"  Flashlight-like build: {evaluate(ARCH['A Flashlight-like (chemical, halo loop, laser)'])['m_wet']:.1f} kg (real about 14)")

    print('\n== wiring check: every number in the model changes some result when nudged ==')
    tables = dict(BRIEF=BRIEF, CONST=CONST, TEST_FACTOR=TEST_FACTOR, INSTR=INSTR, ARRAY=ARRAY, BATT=BATT, PROP=PROP,
                  RADIO=RADIO, ANT=ANT, COMP=COMP, ADCS=ADCS, ORBIT=ORBIT, GROUND=GROUND)
    def signature():
        sig = []
        for nm, d in ARCH.items():
            o = evaluate(d)
            sig.append(flat({k: v for k, v in o.items()}))
            if o['go']:
                r = random.Random(11)
                runs = [simulate(d, r) for _ in range(150)]
                sig.append((sum(x['score'] for x in runs), tuple(sorted(x['level'] for x in runs))))
                sig.append(simulate(d, random.Random(1), events=False)['score'])
        return tuple(sig)
    base = signature()
    dead, n = [], 0
    def slots():
        for tn, t in tables.items():
            for k, v in t.items():
                if isinstance(v, dict):
                    for kk in v:
                        yield tn, t[k], kk, f'{tn}.{k}.{kk}'
                else:
                    yield tn, t, k, f'{tn}.{k}'
    for tn, holder, key, label in list(slots()):
        old = holder[key]
        if isinstance(old, str) or old is None or label.startswith('PROP.none') or label == 'BRIEF.horizon':
            continue
        n += 1
        tries = [not old] if isinstance(old, bool) else ([old * 1.5, old * 0.5] if old else [1, 0.3])
        if key in ('ride_turn', 'ride_period', 'sci_turns_req', 'design_turns', 'integ_turns', 'cruise_turns', 'extend_max', 'horizon'):
            tries = [old + 2, max(1, old - 2)]
        hit = False
        for tv in tries:
            holder[key] = tv
            try:
                if signature() != base:
                    hit = True
            except Exception as ex:
                hit = True
            holder[key] = old
            if hit:
                break
        if not hit:
            dead.append(label)
    print(f'  numbers nudged: {n}; with no effect on any result: {len(dead)}')
    for x in dead:
        print('    no effect:', x)
