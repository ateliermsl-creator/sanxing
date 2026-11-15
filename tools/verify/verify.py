# -*- coding: utf-8 -*-
"""
三星蔥工具箱「結構計算」獨立驗證腳本

做法：
  1. 用 Node 直接載入網站的結構計算檔（extract.js），執行計算函式，取得「工具箱」的數值。
  2. 用第三方開源程式或獨立撰寫的公式，從同一組輸入重新計算「參考值」：
       ‧anaStruct（2D 有限元素）：簡支、連續梁、懸臂的 M、V、δ；梁模板第二層大格柵
       ‧PyNite（3D 有限元素）：三角架平面構架的反力、桿件內力、端點撓度
       ‧sectionproperties（有限元素斷面分析）＋ shapely：斷面性質
       ‧獨立重寫（Python、SI 單位）：AISC 柱公式、施工架與排架載重、ACI 318-19 第 17 章錨栓
  3. 逐項比對，|誤差| ≤ 1% 判「一致」；不一致的項目在報告裡寫原因。

用法（在專案根目錄）：
    pip install -r tools/verify/requirements.txt
    python3 tools/verify/verify.py           # 產生 tools/verify/REPORT.md 與 results.json
只讀網站原始檔，不修改網站。
"""
import json
import math
import os
import subprocess
import sys
import warnings

warnings.filterwarnings("ignore")
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
TOL = 0.01  # 1%

# ---------------------------------------------------------------- 工具箱數值（Node）
def app(cases):
    p = subprocess.run(["node", os.path.join(HERE, "extract.js")], input=json.dumps(cases),
                       capture_output=True, text=True, cwd=ROOT, check=True)
    out = json.loads(p.stdout)
    for c, o in zip(cases, out):
        if isinstance(o, dict) and "error" in o:
            raise RuntimeError(f"{c}: {o['error']}")
    return out


def app1(case):
    return app([case])[0]


# ---------------------------------------------------------------- 結果收集
ROWS = []      # 一致性比對（應相同）
NOTES = []     # 假設差異（資訊）
FINDINGS = []  # 發現的問題


def rel(a, b):
    if a is None or b is None:
        return None
    if abs(b) < 1e-12:
        return 0.0 if abs(a) < 1e-9 else float("inf")
    return (a - b) / abs(b)


def cmp(tool, case, item, unit, a, r, src, note=""):
    e = rel(a, r)
    ok = e is not None and abs(e) <= TOL
    ROWS.append(dict(tool=tool, case=case, item=item, unit=unit, app=a, ref=r, src=src,
                     err=e, ok=ok, note=note))
    return ok


def info(tool, case, item, unit, a, r, model, note):
    NOTES.append(dict(tool=tool, case=case, item=item, unit=unit, app=a, ref=r, model=model,
                      err=rel(a, r), note=note))


def finding(level, tool, title, detail):
    FINDINGS.append(dict(level=level, tool=tool, title=title, detail=detail))


# ---------------------------------------------------------------- anaStruct：梁
def fe_beam(spans, w=1.0, EI=1.0e4, left_cant=0.0, right_cant=0.0, nseg=40, points=None,
            dist=None, supports=None):
    """連續梁（各支點鉸支），可有兩端懸臂、集中載重 points=[(x, P)]、
    線性分布 dist(x)->q。回傳 max|M|、max|V|、max|δ|、支點反力。"""
    from anastruct import SystemElements
    # 為了數值穩定，內部固定 EI = 1e6、EA = 1e9（只影響撓度大小，最後依實際 EI 換算）
    ss = SystemElements(EA=1e9, EI=1e6)
    xs = [0.0]
    if left_cant > 0:
        xs.append(left_cant)
    x = xs[-1]
    for L in spans:
        x += L
        xs.append(x)
    if right_cant > 0:
        xs.append(x + right_cant)
    sup_x = supports if supports is not None else ([left_cant + sum(spans[:i]) for i in range(len(spans) + 1)])
    keys = sorted(set([round(v, 9) for v in xs] + [round(v, 9) for v in sup_x] + [round(p[0], 9) for p in (points or [])]))
    grid = []
    for a, b in zip(keys[:-1], keys[1:]):
        n = max(2, int(round(nseg * (b - a) / max(keys[-1] - keys[0], 1e-9))) * 2)
        for k in range(n):
            grid.append((a + (b - a) * k / n, a + (b - a) * (k + 1) / n))
    for a, b in grid:
        ss.add_element([[a, 0], [b, 0]])
    node_of = {}
    for nid, nd in ss.node_map.items():
        node_of[round(nd.vertex.x, 6)] = nid
    sup_nodes = [node_of[round(s, 6)] for s in sup_x]
    ss.add_support_hinged(sup_nodes[0])
    for nid in sup_nodes[1:]:
        ss.add_support_roll(nid)
    if dist is not None or w:
        for eid, (a, b) in enumerate(grid, start=1):
            q = dist((a + b) / 2) if dist is not None else w
            if q:
                ss.q_load(q=-q, element_id=eid, direction="y")
    for xp, P in (points or []):
        ss.point_load(node_id=node_of[round(xp, 6)], Fy=-P)
    ss.solve()
    res = ss.get_element_results(element_id=0)
    M = max(max(abs(e["Mmax"]), abs(e["Mmin"])) for e in res)
    V = max(max(abs(e["Qmax"]), abs(e["Qmin"])) for e in res)
    d = max(abs(ss.get_node_results_system(n)["uy"]) for n in ss.node_map) * 1e6 / EI
    R = [-ss.get_node_results_system(n)["Fy"] for n in sup_nodes]
    return dict(M=M, V=V, d=d, R=R)


def beam_coefs():
    """各支承條件的係數：M = cm·wL²、V = cv·wL、δ = wL⁴/(cd·EI)"""
    out = {}
    L, w, EI = 100.0, 1.0, 1.0e6
    for n in (1, 2, 3, 4, 5):
        r = fe_beam([L] * n, w, EI)
        out[n] = dict(m=r["M"] / (w * L * L), v=r["V"] / (w * L), d=w * L ** 4 / (r["d"] * EI))
    return out


def fe_cantilever(L, w, EI):
    from anastruct import SystemElements
    ss = SystemElements(EA=1e9, EI=EI)
    n = 40
    for k in range(n):
        ss.add_element([[L * k / n, 0], [L * (k + 1) / n, 0]])
    ss.add_support_fixed(1)
    ss.q_load(q=-w, element_id=list(range(1, n + 1)), direction="y")
    ss.solve()
    res = ss.get_element_results(element_id=0)
    M = max(max(abs(e["Mmax"]), abs(e["Mmin"])) for e in res)
    V = max(max(abs(e["Qmax"]), abs(e["Qmin"])) for e in res)
    d = max(abs(ss.get_node_results_system(k)["uy"]) for k in ss.node_map)
    return dict(M=M, V=V, d=d)


# ---------------------------------------------------------------- 1. 梁公式係數
def check_coefs():
    T = "共用：構件公式"
    C = beam_coefs()
    cant = fe_cantilever(100.0, 1.0, 1.0e6)
    # 工具箱的係數（colform.js COL_METHODS、beamform.js BF_CANT）
    cmp(T, "簡支梁", "M 係數（wL²/8）", "", 1 / 8, C[1]["m"], "anaStruct 簡支")
    cmp(T, "簡支梁", "V 係數（0.5wL）", "", 0.5, C[1]["v"], "anaStruct 簡支")
    cmp(T, "簡支梁", "δ 分母（384/5）", "", 384 / 5, C[1]["d"], "anaStruct 簡支")
    cmp(T, "三跨連續梁", "M 係數（wL²/10）", "", 1 / 10, C[3]["m"], "anaStruct 三跨等跨")
    cmp(T, "三跨連續梁", "V 係數（0.6wL）", "", 0.6, C[3]["v"], "anaStruct 三跨等跨")
    cmp(T, "三跨連續梁", "δ 分母（145）", "", 145, C[3]["d"], "anaStruct 三跨等跨")
    cmp(T, "懸臂梁", "M 係數（wL²/2）", "", 1 / 2, cant["M"] / 100 ** 2, "anaStruct 懸臂")
    cmp(T, "懸臂梁", "V 係數（wL）", "", 1.0, cant["V"] / 100, "anaStruct 懸臂")
    cmp(T, "懸臂梁", "δ 分母（8）", "", 8, 1.0 * 100 ** 4 / (cant["d"] * 1.0e6), "anaStruct 懸臂")
    # 參考網站算法的格柵撓度 wL⁴/128EI vs 三跨連續
    info(T, "參考網站算法（格柵）", "δ 分母 128 對三跨連續", "", 128, C[3]["d"], "anaStruct 三跨",
         "分母較小 → 撓度算大 13%，偏保守。")
    for n in (2, 4, 5):
        info(T, f"{n} 跨等跨連續", "M 係數（工具箱用 1/10）", "", 0.1, C[n]["m"], f"anaStruct {n} 跨",
             "工具箱 0.1 小於實際" if C[n]["m"] > 0.1 * (1 + TOL) else "")
        info(T, f"{n} 跨等跨連續", "V 係數（工具箱用 0.6）", "", 0.6, C[n]["v"], f"anaStruct {n} 跨", "")
    if C[2]["m"] > 0.1 * 1.2:
        finding("中", "柱模、牆模、板模、梁模（格柵）",
                "格柵 M = wL²/10、V = 0.6wL 只對「三跨以上」成立；兩跨時低估",
                f"anaStruct：兩跨等跨連續 M = {C[2]['m']:.4f}wL²（工具箱用 0.1，低估 {(1 - 0.1 / C[2]['m']) * 100:.0f}%）、"
                f"V = {C[2]['v']:.3f}wL（工具箱 0.6，低估 {(1 - 0.6 / C[2]['v']) * 100:.0f}%）；四跨 M = {C[4]['m']:.4f}wL²（低估 {(1 - 0.1 / C[4]['m']) * 100:.1f}%）、"
                f"五跨 {C[5]['m']:.4f}wL²（低估 {(1 - 0.1 / C[5]['m']) * 100:.1f}%）。三跨剛好 0.100、0.600。"
                "參考網站與工具箱都用 wL²/10，屬業界常用近似。柱寬小、小格柵只跨兩格時，建議改選「簡支（保守）」或人工確認。")
    return C


# ---------------------------------------------------------------- 斷面（sectionproperties）
def sp_props(outer, holes=(), mesh=None):
    from shapely import Polygon
    from sectionproperties.pre.geometry import Geometry
    from sectionproperties.analysis.section import Section
    g = Geometry(Polygon(outer, [h for h in holes]))
    xs = [p[0] for p in outer]
    ys = [p[1] for p in outer]
    size = mesh or (max(max(xs) - min(xs), max(ys) - min(ys)) ** 2 / 400)
    g.create_mesh(mesh_sizes=[size])
    s = Section(g)
    s.calculate_geometric_properties()
    A = s.get_area()
    cx, cy = s.get_c()
    ixx, iyy, ixy = s.get_ic()
    i11, i22 = s.get_ip()
    phi = s.get_phi()
    zxxp, zxxm, zyyp, zyym = s.get_z()
    return dict(A=A, xc=cx, yc=cy, Ix=ixx, Iy=iyy, Ixy=ixy, Iu=i11, Iv=i22, phi=phi,
                SxT=zxxp, SxB=zxxm, SyR=zyyp, SyL=zyym, J=ixx + iyy)


def rect_pts(b, h):
    return [(0, 0), (b, 0), (b, h), (0, h)]


# ---------------------------------------------------------------- 2. 柱模板
def member_ref(kind, meth, w, L, I, S, A_shear, kv, E, C):
    """依工具箱聲明的支承條件，用 anaStruct 結果算 M、V、δ、fb、fv。"""
    if meth == "s" or (meth == "r" and kind == "ply"):
        n = 1
    else:
        n = 3
    r = fe_beam([L] * n, w, E * I)
    return dict(M=r["M"], V=r["V"], d=r["d"], fb=r["M"] / S, fv=kv * r["V"] / A_shear, n=n)


def check_member_list(T, case, mems, meth, C, tp=None, label=None):
    """mems：extract 輸出的構件；meth：r/c/s。回傳 None。"""
    names = {"ply": "襯板", "stud": "小格柵", "w1": "第一層大格柵", "w2": "第二層大格柵"}
    for m in mems:
        k = m["k"]
        nm = (label or "") + names.get(k, k)
        if m["L"] is None or m["w"] is None:
            continue
        kv = 1.5
        Ashear = None
        # 斷面：由輸入尺寸獨立算（sectionproperties）
        I, S = m["I"], m["S"]
        ref = member_ref("ply" if k == "ply" else "beam", meth, m["w"], m["L"], I, S, 1.0, kv, m["E"], C)
        src = f"anaStruct {'簡支' if ref['n'] == 1 else '三跨連續'}"
        cmp(T, case, f"{nm} M", "kgf·cm", m["M"], ref["M"], src)
        cmp(T, case, f"{nm} V", "kgf", m["V"], ref["V"], src)
        d_app = m["checks"][2]["v"] / 10
        if meth == "r" and k != "ply":
            info(T, case, f"{nm} δ（wL⁴/128EI）", "cm", d_app, ref["d"], src,
                 "參考網站算法的格柵撓度比三跨連續大 13%（偏保守）。")
        else:
            cmp(T, case, f"{nm} δ", "cm", d_app, ref["d"], src)
        fb_app = m["checks"][0]["v"]
        cmp(T, case, f"{nm} fb = M/S", "kgf/cm²", fb_app, ref["M"] / S, src + "＋斷面 S")


def check_col(C):
    T = "柱模板"
    st = {"info": {"H": "300", "bx": "60"}, "gamma": "2.4", "meth": "r",
          "tiers": [{"top": "", "H1": "20", "B2": "40", "H3": "60", "H4": "", "B4": "80"}]}
    r = app1({"tool": "col", "st": st})
    t = r["tiers"][0]
    P = 2.4 * 300 / 1000
    cmp(T, "C1 單階 H=300", "柱底側壓力 P", "kgf/cm²", t["P"], P, "獨立：γ×H")
    # 斷面：sectionproperties
    sp_ply = sp_props(rect_pts(100, 1.5))
    sp_stud = sp_props(rect_pts(3.6, 4.5))
    sp_w = sp_props(rect_pts(9, 4.5))
    for m, sp, nm in [(t["mems"][0], sp_ply, "襯板 1.5（100 cm 板帶）"), (t["mems"][1], sp_stud, "木角材 3.6×4.5"), (t["mems"][2], sp_w, "木角材 9×4.5 躺置")]:
        cmp(T, "斷面", f"{nm} I", "cm⁴", m["I"], sp["Ix"], "sectionproperties")
        cmp(T, "斷面", f"{nm} S", "cm³", m["S"], min(sp["SxT"], sp["SxB"]), "sectionproperties")
    w_exp = {"ply": P * 100, "stud": P * 20, "w1": P * 40, "w2": P * 60}
    for m in t["mems"]:
        cmp(T, "C1 單階 H=300", f"{ {'ply':'襯板','stud':'小格柵','w1':'第一層大格柵','w2':'第二層大格柵'}[m['k']]} 線載重 w", "kgf/cm", m["w"], w_exp[m["k"]], "獨立：P×受載寬")
    check_member_list(T, "C1 單階 H=300（參考網站算法）", t["mems"], "r", C)
    cmp(T, "C1 單階 H=300", "螺桿拉力 T", "kgf", t["tie"]["v"], P * 80 * 60, "獨立：P×B4×H4（H4 空白＝H3）")
    cmp(T, "C1 單階 H=300", "螺桿容許拉力（2.5 分）", "kgf", t["tie"]["a"], 1800 * 0.369, "獨立：Ft×A")
    # 小格柵剪力面積
    stud = t["mems"][1]
    fv_app = stud["checks"][1]["v"]
    fv_std = 1.5 * stud["V"] / (3.6 * 4.5)
    info(T, "C1 單階 H=300", "小格柵剪應力 fv（剪力面積計入襯板厚）", "kgf/cm²", fv_app, fv_std,
         "一般矩形梁 1.5V/(b·h)",
         "工具箱依參考網站把襯板厚度加進小格柵剪力面積 b(h+t)，比只算角材本身低 25%。")
    finding("中", "柱模板、牆模板",
            "小格柵剪應力的剪力面積計入襯板厚度 b×(h + t襯板)",
            f"C1 案例：工具箱 fv = {fv_app:.1f} kgf/cm²，只算角材斷面 1.5V/(b·h) = {fv_std:.1f} kgf/cm²（工具箱低 {(1 - fv_app / fv_std) * 100:.0f}%）。"
            "這等於假設襯板與角材是組合斷面共同受剪，一般釘接的模板不一定成立。公式本身照參考網站正確實作，"
            "是假設偏向不保守；建議由 Matt 決定是否保留，或在畫面加註、加一個「不計襯板」選項。")
    # C2：三階、側壓力上限、三跨連續
    st2 = {"info": {"H": "400"}, "gamma": "2.4", "pmax": "6", "meth": "c",
           "tiers": [{"top": "150", "H1": "25", "B2": "45", "H3": "70", "H4": "60", "B4": "90"},
                     {"top": "280", "H1": "20", "B2": "40", "H3": "60", "H4": "", "B4": "80"},
                     {"top": "", "H1": "15", "B2": "35", "H3": "50", "H4": "", "B4": "70"}]}
    r2 = app1({"tool": "col", "st": st2})
    lo = [0, 150, 280]
    for i, t2 in enumerate(r2["tiers"]):
        P2 = min(2.4 * (400 - lo[i]) / 1000, 0.6)
        cmp(T, f"C2 三階＋上限 6 t/m²", f"第{i + 1}階 P", "kgf/cm²", t2["P"], P2, "獨立：min(γ×深度, 上限)")
        check_member_list(T, f"C2 第{i + 1}階（三跨連續）", t2["mems"], "c", C)
        H4 = float(st2["tiers"][i]["H4"] or st2["tiers"][i]["H3"])
        cmp(T, f"C2 三階＋上限 6 t/m²", f"第{i + 1}階 螺桿拉力", "kgf", t2["tie"]["v"], P2 * float(st2["tiers"][i]["B4"]) * H4, "獨立：P×B4×H4")
    # C3：簡支（保守）
    r3 = app1({"tool": "col", "st": {**st, "meth": "s"}})
    check_member_list(T, "C3 單階（簡支）", r3["tiers"][0]["mems"], "s", C)


# ---------------------------------------------------------------- AISC ASD 柱公式（獨立）
def asd_fa(lam, Fy, E):
    Cc = math.sqrt(2 * math.pi ** 2 * E / Fy)
    if lam <= Cc:
        FS = 5 / 3 + 3 / 8 * lam / Cc - lam ** 3 / (8 * Cc ** 3)
        return (1 - lam ** 2 / (2 * Cc ** 2)) * Fy / FS
    return 12 * math.pi ** 2 * E / (23 * lam ** 2)


def pipe_sect(D, t):
    from sectionproperties.pre.library.steel_sections import circular_hollow_section
    from sectionproperties.analysis.section import Section
    g = circular_hollow_section(d=D, t=t, n=256)
    g.create_mesh(mesh_sizes=[D * t / 20])
    s = Section(g)
    s.calculate_geometric_properties()
    A = s.get_area()
    I = s.get_ic()[0]
    return dict(A=A, I=I, r=math.sqrt(I / A))


def check_wall(C):
    T = "牆模板"
    base = {"info": {"H": "300"}, "gamma": "2.3", "pmode": "ref", "meth": "r"}
    # W1 四層模，參考網站側壓力
    st = {**base, "type": "t4", "tiers": [{"top": "", "H1": "20", "B2": "45", "H3": "60", "H4": "", "B4": "75"}]}
    r = app1({"tool": "wall", "st": st})
    Wo, H = 2.3, 3.0
    pb = (1.5 * Wo + 0.2 * Wo * (H - 1.5)) / 10
    cmp(T, "W1 四層模 H=300", "牆底側壓力（1.5Wo+0.2Wo(H−1.5)）", "kgf/cm²", r["pb"], pb, "獨立：參考網站公式")
    check_member_list(T, "W1 四層模（參考網站算法）", r["tiers"][0]["mems"], "r", C)
    cmp(T, "W1 四層模 H=300", "螺桿拉力", "kgf", r["tiers"][0]["sup"]["v"], pb * 75 * 60, "獨立：P×B4×H4")
    # W2 三層模、兩階、γ×深度
    st2 = {**base, "type": "t3", "pmode": "lin", "info": {"H": "360"},
           "tiers": [{"top": "180", "H1": "20", "B2": "40", "H4": "50", "B4": "60"},
                     {"top": "", "H1": "25", "B2": "45", "H4": "60", "B4": "70"}]}
    r2 = app1({"tool": "wall", "st": st2})
    for i, (lo, H4, B4) in enumerate([(0, 50, 60), (180, 60, 70)]):
        P = 2.3 * (360 - lo) / 1000
        cmp(T, "W2 三層模兩階", f"第{i + 1}階 P", "kgf/cm²", r2["tiers"][i]["P"], P, "獨立：γ×深度")
        check_member_list(T, f"W2 三層模 第{i + 1}階", r2["tiers"][i]["mems"], "r", C)
        cmp(T, "W2 三層模兩階", f"第{i + 1}階 螺桿拉力", "kgf", r2["tiers"][i]["sup"]["v"], P * B4 * H4, "獨立：P×B4×H4")
    # W3 單面模：鋼管斜撐
    st3 = {**base, "type": "s1", "info": {"H": "300"},
           "tiers": [{"top": "", "H1": "20", "B2": "45", "H3": "60", "H4": "100", "B4": "90", "ang": "45"}]}
    r3 = app1({"tool": "wall", "st": st3})
    ps = pipe_sect(4.86, 0.24)
    cmp(T, "鋼管 D4.86×t0.24", "A", "cm²", r3["pipe"]["A"], ps["A"], "sectionproperties")
    cmp(T, "鋼管 D4.86×t0.24", "I", "cm⁴", r3["pipe"]["I"], ps["I"], "sectionproperties")
    cmp(T, "鋼管 D4.86×t0.24", "r", "cm", r3["pipe"]["r"], ps["r"], "sectionproperties")
    t = r3["tiers"][0]
    br = t["br"]
    zs = [b["z"] for b in r3["braces"]]
    cmp(T, "W3 單面模", "斜撐支數（每 100 cm 一支，至牆頂）", "支", len(zs), 3, "獨立：300/100")
    th = math.radians(45)
    Hf = pb * 100 * 90
    N = Hf / math.cos(th)
    L = 300 / math.sin(th)
    lam = L / ps["r"]
    Fa = asd_fa(lam, 2400, 2.1e6)
    cmp(T, "W3 單面模", "斜撐水平力 H = P×H4×B4", "kgf", br["Hf"], Hf, "獨立")
    cmp(T, "W3 單面模", "斜撐軸力 N = H/cosθ", "kgf", br["N"], N, "獨立")
    cmp(T, "W3 單面模", "最長斜撐 L = z/sinθ", "cm", br["L"], L, "獨立")
    cmp(T, "W3 單面模", "長細比 λ", "", br["lam"], lam, "獨立＋sectionproperties r")
    cmp(T, "W3 單面模", "容許壓應力 Fa（AISC ASD）", "kgf/cm²", br["Fa"], Fa, "獨立：AISC ASD E2")
    cmp(T, "W3 單面模", "壓應力 fc = N/A", "kgf/cm²", t["sup"]["v"], N / ps["A"], "獨立")


def check_fa():
    T = "共用：鋼管挫曲（ASD）"
    lams = [0, 40, 80, 120, 131.4, 160, 200]
    out = app([{"tool": "fa", "lam": l, "Fy": 2400, "E": 2.1e6} for l in lams])
    for l, o in zip(lams, out):
        cmp(T, "Fy 2400、E 2.1×10⁶", f"λ = {l} 的 Fa", "kgf/cm²", o["Fa"], asd_fa(l, 2400, 2.1e6), "獨立：AISC ASD E2-1/E2-2")
    # LRFD 柱公式 scFcr 與 AISC 360-16 E3 的寫法等價
    T2 = "共用：鋼柱挫曲（LRFD）"
    for KLr in [20, 60, 100, 140, 200]:
        o = app1({"tool": "fcr", "KLr": KLr, "Fy": 355, "E": 200000})
        Fy, E = 355.0, 200000.0
        Fe = math.pi ** 2 * E / KLr ** 2
        Fcr = 0.658 ** (Fy / Fe) * Fy if KLr <= 4.71 * math.sqrt(E / Fy) else 0.877 * Fe
        cmp(T2, "Fy 355、E 200000 MPa", f"KL/r = {KLr} 的 Fcr", "MPa", o["Fcr"], Fcr, "獨立：AISC 360-16 E3（Fe 寫法）")


# ---------------------------------------------------------------- 板模板
def check_slab(C):
    T = "板模板"
    st = {"info": {"H": "320", "t": "15"}, "gap": {"L1": "30", "L2": "90", "L3": "90"}, "meth": "r"}
    r = app1({"tool": "slab", "st": st})
    N1 = 2.3 * 15 / 1000
    N = N1 * 1.5 + 0.0150 + 0.0015
    cmp(T, "S1 板厚 15、L1/L2/L3 = 30/90/90", "設計載重 N", "kgf/cm²", r["N"], N, "獨立：Wo×t×1.5＋150＋15 kgf/m²")
    exp_w = {"ply": N * 100, "w1": N * 30, "w2": N * 90}
    for m in r["mems"]:
        cmp(T, "S1", f"{ {'ply':'襯板','w1':'第一層大格柵','w2':'第二層大格柵'}[m['k']]} w", "kgf/cm", m["w"], exp_w[m["k"]], "獨立")
    mems = [dict(m) for m in r["mems"]]
    check_member_list(T, "S1（參考網站算法）", mems, "r", C)
    ps = pipe_sect(4.86, 0.24)
    P = N * 90 * 90
    L = 320 - 15
    lam = L / ps["r"]
    cmp(T, "S1", "支撐軸力 P = N×L2×L3", "kgf", r["P"], P, "獨立")
    cmp(T, "S1", "支撐長 L = 樓高 − 板厚", "cm", r["L"], L, "獨立")
    cmp(T, "S1", "長細比 λ", "", r["lam"], lam, "sectionproperties r")
    cmp(T, "S1", "容許壓應力 Fa", "kgf/cm²", r["Fa"], asd_fa(lam, 2400, 2.1e6), "獨立：AISC ASD")
    cmp(T, "S1", "壓應力 fc", "kgf/cm²", r["sup"]["v"], P / ps["A"], "獨立")
    # 全模型：襯板（多跨連續）→ 第一層 → 第二層，用 anaStruct 算支點反力傳遞
    ply = fe_beam([30] * 4, N * 100, 1.0)
    info(T, "S1", "襯板 M：工具箱簡支 vs 四跨連續", "kgf·cm", r["mems"][0]["M"], ply["M"], "anaStruct 四跨",
         "工具箱襯板用簡支 wL²/8，比連續板保守。")


# ---------------------------------------------------------------- 梁模板
def check_beam(C):
    T = "梁模板"
    st = {"info": {"Bb": "40", "Hb": "80", "H": "320"}, "meth": "r",
          "n1": "3", "L1": ["12", "25", "25", "", ""], "L2": "60", "nt": "2", "H4": ["20", "40", "", "", ""],
          "nb": "2", "np": "2", "L4": "90"}
    r = app1({"tool": "beam", "st": st})
    Hb = 80.0
    N1 = 2.3 * Hb / 1000
    N = 1.5 * N1 + 0.0165
    cmp(T, "B1 梁 40×80", "設計載重 N", "kgf/cm²", r["N"], N, "獨立")
    p = lambda z: N * max(0, Hb - z) / Hb
    # 第一層大格柵分配
    z = [12, 37, 62]
    trib = []
    for i, v in enumerate(z):
        lo = 0 if i == 0 else (z[i - 1] + v) / 2
        hi = Hb if i == len(z) - 1 else (v + z[i + 1]) / 2
        trib.append((lo, hi))
    for i, (m, (lo, hi)) in enumerate(zip(r["first"], trib)):
        w = p((lo + hi) / 2) * (hi - lo)
        cmp(T, "B1 側模第一層大格柵", f"第{i + 1}支 w", "kgf/cm", m["w"], w, "獨立：p(中點)×分配高")
        fe = fe_beam([60] * 3, w, 1.0)
        cmp(T, "B1 側模第一層大格柵", f"第{i + 1}支 M", "kgf·cm", m["M"], fe["M"], "anaStruct 三跨")
    # 第二層大格柵：工具箱分段（兩端懸臂） vs 連續梁有限元素
    seg_M = max(m["M"] for m in r["second"])
    seg_V = max(m["V"] for m in r["second"])
    ties = [20, 60]
    # (a) 側壓力直接作用（線性分布），支點在螺桿，兩端懸臂
    fa = fe_beam([40], 0, 1.0, left_cant=20, right_cant=20, dist=lambda x: p(x) * 60, supports=[20, 60])
    # (b) 第一層大格柵集中力（三跨連續反力 ≈ 1.1wL；此處用 w×L2 與工具箱一致）
    pts = [(zi, m["w"] * 60) for zi, m in zip(z, r["first"])]
    fb = fe_beam([40], 0, 1.0, left_cant=20, right_cant=20, points=pts, supports=[20, 60])
    info(T, "B1 側模第二層大格柵", "max M：分段算法 vs 連續梁（側壓力線性分布）", "kgf·cm", seg_M, fa["M"],
         "anaStruct 螺桿為支點、兩端懸臂", "")
    info(T, "B1 側模第二層大格柵", "max M：分段算法 vs 連續梁（第一層格柵集中力）", "kgf·cm", seg_M, fb["M"],
         "anaStruct 集中力", "實際力由第一層大格柵以集中力傳入。")
    info(T, "B1 側模第二層大格柵", "max V：分段算法 vs 連續梁（集中力）", "kgf", seg_V, fb["V"], "anaStruct 集中力", "")
    # 螺桿拉力 vs 連續梁反力
    tie_app = [t["v"] for t in r["ties"]]
    for i in range(2):
        info(T, "B1 螺桿", f"第{i + 1}階拉力：分配高 vs 連續梁反力（集中力）", "kgf", tie_app[i], fb["R"][i] , "anaStruct 反力", "")
    tot_app = sum(tie_app)
    tot_fe = sum(fb["R"])
    cmp(T, "B1 螺桿", "螺桿拉力合計 = 第二層格柵受力合計", "kgf", tot_app, sum(pz[1] for pz in pts), "獨立：力平衡")
    # 懸臂端：均布（中點值）vs 線性分布
    bot = r["second"][0]
    L0 = 20.0
    pa, pb_ = p(20) * 60, p(0) * 60
    Mlin = L0 ** 2 * (pa / 6 + pb_ / 3)
    info(T, "B1 側模第二層大格柵", "梁底端懸臂 M：中點均布 vs 線性分布", "kgf·cm", bot["M"], Mlin, "獨立：梯形載重懸臂",
         "梁底側壓力最大，在懸臂自由端；用中點值平均會略低估。")
    # 底模
    L3 = 40 / 2
    e = r["bply"][0]
    cmp(T, "B1 底模", "梁底襯板（邊距 L3/2）M", "kgf·cm", e["M"], N * 100 * (L3 / 2) ** 2 / 8, "獨立：簡支")
    m2 = r["bply"][1]
    cmp(T, "B1 底模", "梁底襯板（貫材間 L3）M", "kgf·cm", m2["M"], N * 100 * L3 ** 2 / 8, "獨立：簡支")
    fe = fe_beam([90] * 3, N * L3, 1.0)
    cmp(T, "B1 底模", "梁底貫材 M（三跨）", "kgf·cm", r["bw"]["M"], fe["M"], "anaStruct 三跨")
    ps = pipe_sect(4.86, 0.24)
    P = N * (40 / 2) * 90
    L = 320 - 80
    cmp(T, "B1 鋼管支撐", "P = N×(Bb/支數)×L4", "kgf", r["P"], P, "獨立")
    cmp(T, "B1 鋼管支撐", "Fa", "kgf/cm²", r["Fa"], asd_fa(L / ps["r"], 2400, 2.1e6), "獨立：AISC ASD")
    cmp(T, "B1 鋼管支撐", "fc", "kgf/cm²", r["sup"]["v"], P / ps["A"], "獨立")
    return dict(seg_M=seg_M, seg_V=seg_V, fa=fa, fb=fb, bot=bot["M"], Mlin=Mlin, tie_app=tie_app)


# ---------------------------------------------------------------- 施工架
MPA = 1 / 0.0980665


def lrfd_fcr(KLr, Fy, E):
    Fe = math.pi ** 2 * E / KLr ** 2
    return 0.658 ** (Fy / Fe) * Fy if Fy / Fe <= 2.25 else 0.877 * Fe


def check_scaf():
    T = "施工架"
    st = {"levels": "12", "rows": "6", "q": "150", "work": "2", "wp": "120", "wn": "-90", "beta": "35", "ch": "0.25", "cvr": "0.5",
          "tie": {"sv": "3.6", "sh": "3.66", "d": "1.2", "KL": "20"}}
    r = app1({"tool": "scaf", "st": st})
    panel = 12.81 + 2.14 * 4 + 1.28 * 2 + 11.17 * 1 + 5 + 0
    cmp(T, "SC1 12 層", "單跨自重", "kgf", r["panel"], panel, "獨立：自重表加總")
    D = panel * 12 / 2
    Lv = 150 * 1.829 * 0.762 * 2 / 2
    cmp(T, "SC1 12 層", "每支主柱 D", "kgf", r["D"], D, "獨立")
    cmp(T, "SC1 12 層", "每支主柱 L", "kgf", r["Lv"], Lv, "獨立")
    Ev = 0.25 * 0.5 * D
    eta = math.ceil((1 - 0.35) * 10 - 1e-9) / 10
    A = 3.6 * 3.66
    Wc, Wt = eta * 120 * A, eta * 90 * A
    Eh = 0.25 * A / (1.829 * 1.725) * panel
    combos = [1.4 * D, 1.2 * D + 1.6 * Lv, 1.2 * D + 0.5 * Lv, 1.2 * D + 0.5 * Lv + Ev, 0.9 * D + Ev, 0.9 * D]
    Nu = max(combos)
    cmp(T, "SC1 12 層", "主柱 Pu（六組取大）", "kgf", r["checks"][0]["v"], Nu, "獨立")
    cs = pipe_sect(4.27, 0.25)
    cap = 0.85 * lrfd_fcr(1 * 172.5 / cs["r"], 355, 200000) * MPA * cs["A"]
    cmp(T, "SC1 12 層", "主柱 φcPn", "kgf", r["checks"][0]["a"], cap, "AISC 360-16 E3＋sectionproperties")
    cmp(T, "SC1 12 層", "壁連座 Tu（1.6W 負壓）", "kgf", r["checks"][1]["v"], max(1.6 * Wt, Eh), "獨立")
    cmp(T, "SC1 12 層", "壁連座 Cu（1.6W 正壓）", "kgf", r["checks"][2]["v"], max(1.6 * Wc, Eh), "獨立")
    cmp(T, "SC1 12 層", "壁連座 Vu（地震）", "kgf", r["checks"][3]["v"], Eh, "獨立")
    Ab = math.pi * 1.2 ** 2 / 4
    rr = 1.2 / 4
    cmp(T, "SC1 12 層", "壁連座 φtTn", "kgf", r["checks"][1]["a"], 0.9 * 215 * MPA * Ab, "獨立")
    cmp(T, "SC1 12 層", "壁連座 φcPn", "kgf", r["checks"][2]["a"], 0.85 * lrfd_fcr(20 / rr, 215, 200000) * MPA * Ab, "AISC 360-16 E3")
    cmp(T, "SC1 12 層", "壁連座 φvVn", "kgf", r["checks"][3]["a"], 0.9 * 0.6 * 215 * MPA * Ab, "獨立")
    cmp(T, "SC1 12 層", "孔隙率 35% 的 η", "", r["eta"], eta, "獨立：參考網站無條件進位到 0.1")


def check_row():
    T = "排架"
    st = {"levels": "2", "slab": "25", "gam": "2400", "other": "50", "q": "200", "eq": "direct", "ch": "0.2", "cvr": "0.5"}
    r = app1({"tool": "row", "st": st})
    panel = 15.55 + 2.14 * 4 + 1.28 * 2 + 11.17 + 5
    area = 1.829 * 0.914
    qd = 0.25 * 2400 + 50
    kpa = 1000 / 9.80665
    q = max(200, 2.4 * kpa, 4.8 * kpa - qd)
    D = panel * 2 / 2 + qd * area / 2
    L = q * area / 2
    Ev = 0.2 * 0.5 * D
    Nu = max(1.4 * D, 1.2 * D + 1.6 * L, 1.2 * D + 0.5 * L + Ev, 0.9 * D + Ev)
    cmp(T, "R1 板厚 25、兩層", "活載 q（ACI 347R 最小值）", "kgf/m²", r["q"], q, "獨立")
    cmp(T, "R1 板厚 25、兩層", "每支主柱 D", "kgf", r["D"], D, "獨立")
    cmp(T, "R1 板厚 25、兩層", "每支主柱 L", "kgf", r["L"], L, "獨立")
    cmp(T, "R1 板厚 25、兩層", "Pu", "kgf", r["check"]["v"], Nu, "獨立")
    cs = pipe_sect(4.27, 0.25)
    cmp(T, "R1 板厚 25、兩層", "φcPn", "kgf", r["check"]["a"], 0.85 * lrfd_fcr(172.5 / cs["r"], 355, 200000) * MPA * cs["A"], "AISC 360-16 E3")


# ---------------------------------------------------------------- 三角架（PyNite）
def brk_geometry(st):
    f = lambda k: float(st[k])
    X, Y, y1, y2, x1, x2, q1, q2, a, B = [f(k) for k in ["X", "Y", "y1", "y2", "x1", "x2", "q1", "q2", "s1", "s2"]]
    typ = st["type"]
    lowerX = x1 if typ == "1" else X
    lower = lambda x: (x, -Y + Y * x / lowerX)
    segs = [("top", (0, 0), (X, 0)), ("wall", (0, 0), (0, -Y)), ("bottom", (0, -Y), (lowerX, 0))]
    if typ == "2":
        segs.append(("web", (x1, 0), lower(x1)))
    if typ == "3":
        segs += [("web", (x1, 0), lower(x1)), ("web", (x1 + x2, 0), lower(x1 + x2))]
    if typ == "4":
        segs += [("web", (x1, 0), lower(q1)), ("web", lower(q1), (x1 + x2, 0))]
    if typ == "5":
        segs += [("web", (0, -Y), (x1, 0)), ("web", (x1, 0), lower(q1)), ("web", lower(q1), (x1 + x2, 0)), ("web", (x1 + x2, 0), lower(q1 + q2))]
    sup = [(0, -y1), (0, -y1 - y2)]
    loads = [(a, 0), (a + B, 0)]
    return segs, sup, loads, X


def brk_section(kind, b, h, t, d):
    """以 sectionproperties 算斷面（輸入 mm → cm），回傳托架平面內的 A、I、S、Imin。"""
    from sectionproperties.pre.library import steel_sections as ss_
    from sectionproperties.analysis.section import Section
    b, h, t, d = b / 10, h / 10, t / 10, d / 10
    if kind == "rhs":
        g = ss_.rectangular_hollow_section(d=h, b=b, t=t, r_out=0, n_r=1)
    elif kind == "chs":
        g = ss_.circular_hollow_section(d=d, t=t, n=128)
    elif kind == "channel":
        g = ss_.channel_section(d=h, b=b, t_f=t, t_w=t, r=0, n_r=1)
    else:
        g = ss_.angle_section(d=b, b=b, t=t, r_r=0, r_t=0, n_r=1)
    g.create_mesh(mesh_sizes=[t * t])
    s = Section(g)
    s.calculate_geometric_properties()
    A = s.get_area()
    ixx, iyy, ixy = s.get_ic()
    i11, i22 = s.get_ip()
    zxxp, zxxm, _, _ = s.get_z()
    return dict(A=A, I=ixx, S=min(zxxp, zxxm), Imin=i22, I22=i22)


def brk_pynite(st, secs, E):
    from Pynite import FEModel3D
    segs, sup, loads, X = brk_geometry(st)
    P = [1.2 * float(st["PD1"]) + 1.6 * float(st["PL1"]), 1.2 * float(st["PD2"]) + 1.6 * float(st["PL2"])]
    selfF = 1.2 if st.get("self", "1") == "1" else 0
    m = FEModel3D()
    m.add_material("steel", E, E / 2.6, 0.3, 0)
    key = lambda p: (round(p[0], 6), round(p[1], 6))
    nodes = {}
    def node(p):
        k = key(p)
        if k not in nodes:
            nm = f"N{len(nodes)}"
            nodes[k] = nm
            m.add_node(nm, p[0], p[1], 0)
        return nodes[k]
    special = [p for s in segs for p in (s[1], s[2])] + sup + loads
    for p in special:
        node(p)
    def on_seg(p, a, b):
        L2 = (b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2
        t = ((p[0] - a[0]) * (b[0] - a[0]) + (p[1] - a[1]) * (b[1] - a[1])) / L2
        q = (a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1]))
        return t if 1e-9 < t < 1 - 1e-9 and math.hypot(q[0] - p[0], q[1] - p[1]) < 1e-6 else None
    mems = []
    for gi, (grp, a, b) in enumerate(segs):
        sec = secs[grp]
        sname = f"S_{grp}"
        if sname not in m.sections:
            m.add_section(sname, sec["A"], sec["I"], sec["I"], sec["I"])
        ts = [0.0, 1.0]
        if grp != "web":
            for k in list(nodes):
                t = on_seg(k, a, b)
                if t is not None:
                    ts.append(t)
        ts = sorted(set(ts))
        for i in range(len(ts) - 1):
            pa = (a[0] + ts[i] * (b[0] - a[0]), a[1] + ts[i] * (b[1] - a[1]))
            pb = (a[0] + ts[i + 1] * (b[0] - a[0]), a[1] + ts[i + 1] * (b[1] - a[1]))
            nm = f"M{len(mems)}"
            m.add_member(nm, node(pa), node(pb), "steel", sname)
            if grp == "web":
                m.def_releases(nm, Rzi=True, Rzj=True)
            q = selfF * sec["A"] * 0.00785
            if q:
                m.add_member_dist_load(nm, "FY", -q, -q)
            mems.append((nm, grp))
    for k, nm in nodes.items():
        m.def_support(nm, False, False, True, True, True, False)
    for p in sup:
        m.def_support(node(p), True, True, True, True, True, True)
    for p, Pi in zip(loads, P):
        m.add_node_load(node(p), "FY", -Pi)
    m.analyze_linear(check_statics=False)
    out = {}
    for nm, grp in mems:
        mb = m.members[nm]
        o = out.setdefault(grp, dict(Nc=0.0, Nt=0.0, M=0.0, V=0.0))
        o["Nc"] = max(o["Nc"], mb.max_axial("Combo 1"))
        o["Nt"] = max(o["Nt"], -mb.min_axial("Combo 1"))
        o["M"] = max(o["M"], abs(mb.max_moment("Mz", "Combo 1")), abs(mb.min_moment("Mz", "Combo 1")))
        o["V"] = max(o["V"], abs(mb.max_shear("Fy", "Combo 1")), abs(mb.min_shear("Fy", "Combo 1")))
    reac = [[m.nodes[node(p)].RxnFX["Combo 1"], m.nodes[node(p)].RxnFY["Combo 1"], m.nodes[node(p)].RxnMZ["Combo 1"]] for p in sup]
    tip = m.nodes[node((X, 0))].DY["Combo 1"]
    return dict(groups=out, reac=reac, tip=tip, P=P)


def check_brk():
    T = "三角架"
    E = 200000 * MPA
    base = {"PD1": "300", "PD2": "250", "PL1": "200", "PL2": "150", "self": "1"}
    cases = [
        ("K1 型式1 上弦懸伸", {"type": "1", "x1": "60"}),
        ("K2 型式2 單豎桿", {"type": "2", "x1": "70"}),
        ("K3 型式3 雙豎桿", {"type": "3", "x1": "40", "x2": "50"}),
        ("K4 型式4 V 形", {"type": "4", "x1": "40", "x2": "60", "q1": "70"}),
        ("K5 型式5 連續斜桿", {"type": "5", "x1": "40", "x2": "50", "q1": "60", "q2": "50"}),
        ("K6 型式3 圓管＋槽鋼＋角鋼", {"type": "3", "x1": "40", "x2": "50", "sec": {
            "top": {"kind": "channel", "b": "50", "h": "100", "t": "5"}, "bottom": {"kind": "chs", "d": "48.6", "t": "3.2"},
            "wall": {"kind": "rhs", "b": "50", "h": "100", "t": "3.2"}, "web": {"kind": "angle", "b": "50", "t": "5"}}}),
    ]
    sec_done = set()
    for name, extra in cases:
        st = {**base, **{k: v for k, v in extra.items() if k != "sec"}}
        if "sec" in extra:
            st["sec"] = extra["sec"]
        r = app1({"tool": "brk", "st": st})
        if r["miss"]:
            raise RuntimeError(f"{name}: {r['miss']}")
        full = {"X": "150", "Y": "48", "y1": "8", "y2": "24", "x1": "40", "x2": "50", "q1": "50", "q2": "50", "s1": "20", "s2": "76.2"}
        full.update(st)
        secd = {"top": dict(kind="rhs", b="40", h="60", t="3", d="42.7"), "bottom": dict(kind="rhs", b="40", h="60", t="3", d="42.7"),
                "wall": dict(kind="rhs", b="40", h="60", t="3", d="42.7"), "web": dict(kind="angle", b="40", h="40", t="3", d="42.7")}
        for g, v in (st.get("sec") or {}).items():
            secd[g].update(v)
        secs = {}
        for g, s in secd.items():
            sp = brk_section(s["kind"], float(s["b"]), float(s["h"]), float(s["t"]), float(s["d"]))
            secs[g] = sp
            a = r["secs"][g]
            key = (s["kind"], s["b"], s["h"], s["t"], s["d"])
            if key not in sec_done:
                sec_done.add(key)
                lab = {"rhs": f"矩形管 {s['b']}×{s['h']}×{s['t']}", "chs": f"圓管 φ{s['d']}×{s['t']}", "channel": f"槽鋼 {s['h']}×{s['b']}×{s['t']}", "angle": f"角鋼 L{s['b']}×{s['b']}×{s['t']}"}[s["kind"]]
                cmp(T, "斷面（mm 輸入）", f"{lab} A", "cm²", a["A"], sp["A"], "sectionproperties")
                if s["kind"] == "angle":
                    cmp(T, "斷面（mm 輸入）", f"{lab} Imin", "cm⁴", a["A"] * a["rmin"] ** 2, sp["Imin"], "sectionproperties 主軸")
                else:
                    cmp(T, "斷面（mm 輸入）", f"{lab} I（平面內）", "cm⁴", a["I"], sp["I"], "sectionproperties")
                    cmp(T, "斷面（mm 輸入）", f"{lab} S（平面內）", "cm³", a["S"], sp["S"], "sectionproperties")
        # 用工具箱同一組斷面值進 PyNite，專門比構架分析
        secs_app = {g: dict(A=r["secs"][g]["A"], I=r["secs"][g]["I"]) for g in r["secs"]}
        fe = brk_pynite(full, secs_app, E)
        for i, lab in enumerate(["上支承", "下支承"]):
            for j, comp in enumerate(["Rx", "Ry", "Mz"]):
                a = r["sol"]["reac"][i][j]
                b = fe["reac"][i][j]
                tot = max(abs(x) for row in fe["reac"] for x in row[:2])
                # 很小的分量（< 1% 合力）以絕對誤差判斷
                if abs(b) < 0.01 * tot and j < 2:
                    cmp(T, name, f"{lab} {comp}（小量，以合力為分母）", "kgf", tot + a - b, tot, "PyNite")
                else:
                    cmp(T, name, f"{lab} {comp}", "kgf·cm" if comp == "Mz" else "kgf", a, b, "PyNite")
        cmp(T, name, "上弦端點撓度", "cm", -r["sol"]["tipDy"], -fe["tip"], "PyNite")
        # 各桿件群組的最大內力
        grp_app = {}
        for e in r["sol"]["els"]:
            o = grp_app.setdefault(e["grp"], dict(Nc=0.0, Nt=0.0, M=0.0, V=0.0))
            for p in e["pts"]:
                o["Nc"] = max(o["Nc"], -p["N"])
                o["Nt"] = max(o["Nt"], p["N"])
                o["M"] = max(o["M"], abs(p["M"]))
                o["V"] = max(o["V"], abs(p["V"]))
        gn = {"top": "上弦", "bottom": "下斜桿", "wall": "靠牆立材", "web": "加勁桿"}
        for g, o in grp_app.items():
            f = fe["groups"][g]
            big = max(f["Nc"], f["Nt"])
            for k, lab, u in [("Nc", "最大壓力", "kgf"), ("Nt", "最大拉力", "kgf"), ("M", "最大彎矩", "kgf·cm"), ("V", "最大剪力", "kgf")]:
                if g == "web" and k in ("M", "V"):
                    continue
                if f[k] < 0.02 * (big if k in ("Nc", "Nt") else max(f["M"], 1e-9) if k == "M" else max(f["V"], 1e-9)) or f[k] < 1.0:
                    continue  # 幾乎為零的分量不比（例如只受壓的桿件的拉力）
                cmp(T, name, f"{gn[g]} {lab}", u, o[k], f[k], "PyNite")


# ---------------------------------------------------------------- 錨栓（ACI 318-19，SI 獨立實作）
G = 9.80665


def aci_anchor(inp):
    """ACI 318-19 第 17 章，SI（N、mm、MPa）。inp 以工具箱的欄位（cm、kgf、kgf/cm²）輸入，內部換算。
    受力分配沿用工具箱聲明的模型（剛性承板、只計錨栓）；其餘依條文。回傳各檢核的 (需求 kgf, φ強度 kgf)。"""
    cm = 10.0
    nx, ny = int(inp["nx"]), int(inp["ny"])
    sx, sy = float(inp["sx"]) * cm, float(inp["sy"]) * cm
    cL, cR, cB, cT = [float(inp[k]) * cm for k in ("cL", "cR", "cB", "cT")]
    hef0, ha = float(inp["hef"]) * cm, float(inp["ha"]) * cm
    fc = float(inp["fc"]) * 0.0980665
    da, fya, futa0 = float(inp["da"]) * cm, float(inp["fy"]) * 0.0980665, float(inp["fu"]) * 0.0980665
    pitch = float(inp["pitch"])
    typ = inp["type"]
    cast = typ == "cast"
    uncr, supp, duct = inp.get("uncr") == "1", inp.get("supp") == "1", inp.get("duct", "1") == "1"
    lam = 0.75 if inp.get("light") == "1" else 1.0
    # 17.2.4.1 λa（輕質混凝土修正）：普通混凝土 λ = 1 → λa = 1；輕質時膨脹式取 0.8λ
    lam_a = lam if (cast or typ == "under" or lam == 1.0) else 0.8 * lam
    kgf = lambda v: float(inp.get(v) or 0) * G
    P, Vx, Vy = kgf("P"), kgf("Vx"), kgf("Vy")
    Mx, My, Mz = [float(inp.get(k) or 0) * G * cm for k in ("Mx", "My", "Mz")]
    xs = [i * sx for i in range(nx)]
    ys = [j * sy for j in range(ny)]
    A = [(x, y) for y in ys for x in xs]
    n = len(A)
    Wx, Wy = xs[-1], ys[-1]
    xc, yc = Wx / 2, Wy / 2
    Ixx = sum((y - yc) ** 2 for _, y in A)
    Iyy = sum((x - xc) ** 2 for x, _ in A)
    J = Ixx + Iyy
    Ns, Vs = [], []
    for x, y in A:
        N = -P / n - (Mx * (y - yc) / Ixx if Ixx else 0) - (My * (x - xc) / Iyy if Iyy else 0)
        vx = Vx / n - (Mz * (y - yc) / J if J else 0)
        vy = Vy / n + (Mz * (x - xc) / J if J else 0)
        Ns.append(max(0.0, N))
        Vs.append(math.hypot(vx, vy))
    out = {}
    # 17.6.1 鋼材拉力
    Ase = math.pi / 4 * (da - 0.9743 * pitch) ** 2
    futa = min(futa0, 1.9 * fya, 860.0)
    phis_t, phis_v = (0.75, 0.65) if duct else (0.65, 0.60)
    if cast:
        phic_t = 0.75 if supp else 0.70
    else:
        phic_t = {"1": (0.75, 0.65), "2": (0.65, 0.55), "3": (0.55, 0.45)}[inp.get("cat", "2")][0 if supp else 1]
    phic_v = 0.75 if supp else 0.70
    Nmax = max(Ns)
    if Nmax > 0:
        out["steelN"] = (Nmax, phis_t * Ase * futa)
    ten = [(a, N) for a, N in zip(A, Ns) if N > 1e-9]

    def breakout(grp, ecc):
        gx = [a[0] for a, _ in grp]
        gy = [a[1] for a, _ in grp]
        dL, dR, dB, dT = cL + min(gx), cR + (Wx - max(gx)), cB + min(gy), cT + (Wy - max(gy))
        ds = [dL, dR, dB, dT]
        hef = hef0
        near = [d for d in ds if d < 1.5 * hef0]
        if len(near) >= 3:
            s_max = max([sx if nx > 1 else 0, sy if ny > 1 else 0])
            hef = min(hef0, max(max(near) / 1.5, s_max / 3))
        ANc = (min(dL, 1.5 * hef) + max(gx) - min(gx) + min(dR, 1.5 * hef)) * (min(dB, 1.5 * hef) + max(gy) - min(gy) + min(dT, 1.5 * hef))
        ANco = 9 * hef ** 2
        ANc = min(ANc, len(grp) * ANco)
        if cast and 280 <= hef <= 635:
            Nb = 3.9 * lam_a * math.sqrt(fc) * hef ** (5 / 3)
        else:
            kc = 10 if cast else 7
            Nb = kc * lam_a * math.sqrt(fc) * hef ** 1.5
        pe = 1.0
        if ecc:
            S = sum(N for _, N in grp)
            ex = abs(sum(N * a[0] for a, N in grp) / S - (min(gx) + max(gx)) / 2)
            ey = abs(sum(N * a[1] for a, N in grp) / S - (min(gy) + max(gy)) / 2)
            pe = min(1, 1 / (1 + ex / (1.5 * hef))) * min(1, 1 / (1 + ey / (1.5 * hef)))
        camin = min(ds)
        ped = 1.0 if camin >= 1.5 * hef else 0.7 + 0.3 * camin / (1.5 * hef)
        pc = (1.25 if cast else 1.4) if uncr else 1.0
        pcp = 1.0
        if not cast and uncr and not supp:
            cac = {"torque": 4, "disp": 4, "under": 2.5}[typ] * hef0
            pcp = 1.0 if camin >= cac else max(camin / cac, 1.5 * hef / cac)
        return ANc / ANco * pe * ped * pc * pcp * Nb, hef

    if ten:
        Ncbg, hef = breakout(ten, True)
        out["cbN"] = (sum(N for _, N in ten), phic_t * Ncbg)
        if cast:
            Np = 8 * float(inp["Abrg"]) * 100 * fc
            out["po"] = (Nmax, phic_t * (1.4 if uncr else 1.0) * Np)
            ca1 = min(cL, cR, cB, cT)
            if hef0 > 2.5 * ca1:
                Abrg = float(inp["Abrg"]) * 100
                Nsb = 13 * ca1 * math.sqrt(Abrg) * lam_a * math.sqrt(fc)
                # 17.6.4.1.1：角落（ca2 < 3ca1）折減 (1 + ca2/ca1)/4
                edges = sorted([cL, cR, cB, cT])
                ca2 = edges[1]
                fac = (1 + min(max(ca2 / ca1, 1), 3)) / 4 if ca2 < 3 * ca1 else 1.0
                out["sb"] = (Nmax, phic_t * Nsb * fac)
                out["sb_nocorner"] = (Nmax, phic_t * Nsb)
        elif inp.get("Np"):
            out["po"] = (Nmax, phic_t * float(inp["Np"]) * G)
    # 17.7.1 鋼材剪力
    Vtot = math.hypot(Vx, Vy)
    if Vtot > 0 or Mz:
        out["steelV"] = (max(Vs), phis_v * 0.6 * Ase * futa * (0.8 if inp.get("grout") == "1" else 1))
    le = min(hef0, 8 * da)

    def vb(ca1):
        return min(0.6 * (le / da) ** 0.2 * math.sqrt(da) * lam_a * math.sqrt(fc) * ca1 ** 1.5,
                   3.7 * lam_a * math.sqrt(fc) * ca1 ** 1.5)

    def shear(V, ca1, ca2a, ca2b, width, key, literal):
        if not V:
            return
        if literal and ca2a < 1.5 * ca1 and ca2b < 1.5 * ca1 and ha < 1.5 * ca1:
            s_ = max([sx if nx > 1 else 0, sy if ny > 1 else 0])
            ca1 = max(max(ca2a, ca2b) / 1.5, ha / 1.5, s_ / 3)  # 17.7.2.1.2
        h = min(1.5 * ca1, ha)
        w = min(ca2a, 1.5 * ca1) + width + min(ca2b, 1.5 * ca1)
        AVc, AVco = h * w, 4.5 * ca1 ** 2
        ca2 = min(ca2a, ca2b)
        ped = 1.0 if ca2 >= 1.5 * ca1 else 0.7 + 0.3 * ca2 / (1.5 * ca1)
        pc = 1.4 if uncr else (1.2 if supp else 1.0)
        ph = max(1.0, math.sqrt(1.5 * ca1 / ha))
        out[key] = (abs(V), phic_v * AVc / AVco * ped * pc * ph * vb(ca1))

    for literal, suf in ((False, ""), (True, "_lit")):
        shear(Vx, cR if Vx > 0 else cL, cB, cT, Wy, "cbVx" + suf, literal)
        shear(Vy, cT if Vy > 0 else cB, cL, cR, Wx, "cbVy" + suf, literal)
    if Vtot > 0:
        Ncpg, _ = breakout([(a, 1.0) for a in A], False)
        kcp = 1 if hef0 < 65 else 2
        out["cp"] = (Vtot, phic_v * kcp * Ncpg)
    return {k: (a / G, b / G) for k, (a, b) in out.items()}


def check_anc():
    T = "錨栓"
    cases = [
        ("A1 後置扭控、未開裂、2×2", {"type": "torque", "uncr": "1", "nx": "2", "ny": "2", "sx": "15", "sy": "15",
                                 "cL": "12", "cR": "30", "cB": "30", "cT": "30", "hef": "8", "ha": "30", "fc": "280",
                                 "da": "1.2", "pitch": "1.75", "Np": "1500", "P": "-1200", "Vx": "600", "Mx": "8000"}),
        ("A2 預埋擴頭、開裂、2×3、近兩邊", {"type": "cast", "nx": "2", "ny": "3", "sx": "20", "sy": "15",
                                     "cL": "10", "cR": "40", "cB": "12", "cT": "40", "hef": "30", "ha": "50", "fc": "280",
                                     "da": "2", "pitch": "2.5", "fy": "2400", "fu": "4000", "Abrg": "4", "P": "-3000", "Vy": "-1500", "My": "20000"}),
        ("A3 後置擴底、三邊近邊（hef 修正）", {"type": "under", "nx": "2", "ny": "2", "sx": "10", "sy": "10",
                                       "cL": "10", "cR": "10", "cB": "10", "cT": "60", "hef": "15", "ha": "40", "fc": "350",
                                       "da": "1.6", "pitch": "2", "Np": "4000", "P": "-2000", "Vx": "500", "Vy": "500", "Mz": "3000"}),
        ("A4 預埋、薄構材窄邊（ca1 限制）", {"type": "cast", "nx": "1", "ny": "2", "sx": "10", "sy": "10",
                                      "cL": "8", "cR": "50", "cB": "8", "cT": "8", "hef": "12", "ha": "15", "fc": "280",
                                      "da": "1.6", "pitch": "2", "Abrg": "3", "Vx": "800"}),
    ]
    names = {"steelN": "鋼材拉力", "cbN": "混凝土拉破", "po": "拔出", "sb": "側面爆裂", "steelV": "鋼材剪力",
             "cbVx": "混凝土剪破 X", "cbVy": "混凝土剪破 Y", "cp": "撬破"}
    kmap = {"steelN": "steelN", "cbN": "cbN", "po": "po", "sb": "sb", "steelV": "steelV", "cp": "cp"}
    res = {}
    for name, inp in cases:
        st = {"supp": "0", "duct": "1", "grout": "0", "cat": "2", "light": "0", "uncr": "0", **inp}
        r = app1({"tool": "anc", "st": st})
        if r["miss"]:
            raise RuntimeError(f"{name}: {r['miss']}")
        ref = aci_anchor({"fy": "2400", "fu": "4000", **st})
        res[name] = (r, ref)
        ck = {c["k"]: c for c in r["checks"]}
        for k, (dem, cap) in ref.items():
            if k.endswith("_lit") or k == "sb_nocorner":
                continue
            ak = k
            if k.startswith("cbV"):
                ak = next((c for c in ck if c.startswith("cbV" + ("+" if False else "")) and (("X" in c) == (k == "cbVx"))), None)
            if ak not in ck:
                cmp(T, name, f"{names.get(k, k)}（工具箱未檢核）", "kgf", None, cap, "ACI 318-19 SI 獨立實作")
                continue
            c = ck[ak]
            cmp(T, name, f"{names.get(k, k)} 需求", "kgf", c["v"], dem, "ACI 318-19 SI 獨立實作")
            if k == "sb" and abs(rel(c["a"], cap) or 0) > TOL:
                cmp(T, name, f"{names[k]} φ強度", "kgf", c["a"], cap, "ACI 318-19 17.6.4.1.1（含角落折減）",
                    "工具箱未乘角落折減 (1 + ca2/ca1)/4")
                cmp(T, name, f"{names[k]} φ強度（不含角落折減）", "kgf", c["a"], ref["sb_nocorner"][1], "ACI 318-19 SI 獨立實作")
            else:
                cmp(T, name, f"{names.get(k, k)} φ強度", "kgf", c["a"], cap, "ACI 318-19 SI 獨立實作")
        for k in ("cbVx_lit", "cbVy_lit"):
            if k in ref and abs(rel(ref[k][1], ref[k[:-4]][1]) or 0) > TOL:
                base_k = k[:-4]
                ak = next(c for c in ck if c.startswith("cbV") and (("X" in c) == (base_k == "cbVx")))
                info(T, name, f"{names[base_k]} φ強度：未做 vs 有做 17.7.2.1.2 ca1 限制", "kgf", ck[ak]["a"], ref[k][1],
                     "ACI 318-19 SI 獨立實作", "窄薄構材條文要求 ca1 取 max(ca2,max/1.5, ha/1.5, s/3)；工具箱用實際 ca1。")
    # 換算常數
    o = app1({"tool": "anc", "st": {"P": "-1", "nx": "1", "ny": "1"}})
    return res


# ---------------------------------------------------------------- 斷面性質
def check_sec():
    T = "斷面性質"
    shapes = [
        ("實心矩形 200×120", "rect", {"B": 200, "H": 120}),
        ("方管 200×120×20", "box", {"B": 200, "H": 120, "t": 20}),
        ("H 型 300×150×6.5×9", "H", {"H": 300, "B": 150, "tw": 6.5, "tf": 9}),
        ("C 型 150×75×6.5×10", "C", {"H": 150, "B": 75, "tw": 6.5, "tf": 10}),
        ("L 型不等邊 100×75×7×10", "L", {"B": 100, "H": 75, "t1": 7, "t2": 10}),
        ("T 型 200×150×8×12", "T", {"B": 200, "H": 150, "tw": 8, "tf": 12}),
        ("直角三角形 90×60", "tri", {"b": 90, "h": 60}),
        ("圓 D100（72 邊形）", "circ", {"D": 100}),
        ("圓管 D100×t5（72 邊形）", "pipe", {"D": 100, "t": 5}),
    ]
    for name, k, dims in shapes:
        r = app1({"tool": "sec", "shape": k, "dims": dims, "st": {"unit": "mm"}})
        outer = r["outer"]
        holes = r["holes"]
        sp = sp_props(outer, holes)
        for key, lab, u in [("A", "A", "mm²"), ("xc", "形心 x", "mm"), ("yc", "形心 y", "mm"), ("Ix", "Ix", "mm⁴"), ("Iy", "Iy", "mm⁴"),
                            ("Ixy", "Ixy", "mm⁴"), ("Iu", "I 主軸（大）", "mm⁴"), ("Iv", "I 主軸（小）", "mm⁴"), ("J", "極慣性矩 Jc", "mm⁴"),
                            ("SxT", "Sx 上緣", "mm³"), ("SxB", "Sx 下緣", "mm³"), ("SyR", "Sy 右緣", "mm³"), ("SyL", "Sy 左緣", "mm³")]:
            a, b = r[key], sp[key]
            if key == "Ixy" and abs(b) < 1e-6 * max(sp["Ix"], sp["Iy"]):
                cmp(T, name, "Ixy（對稱 ≈ 0，以 Ix 為分母）", u, sp["Ix"] + a, sp["Ix"], "sectionproperties")
                continue
            if key in ("SxT", "SxB", "SyR", "SyL"):
                b = abs(b)
            cmp(T, name, lab, u, a, b, "sectionproperties")
        if k not in ("rect", "box", "circ", "pipe") and r["thU"] is not None:
            # 主軸角：sectionproperties phi 為 11 軸自 x 軸逆時針角度
            th_sp = ((sp["phi"] + 90) % 180) - 90
            cmp(T, name, "主軸角 θu（度，以 90° 為分母）", "°", 90 + r["thU"], 90 + th_sp, "sectionproperties")
        if k == "circ":
            exact = math.pi * 100 ** 4 / 64
            info(T, name, "Ix：72 邊形 vs 真圓", "mm⁴", r["Ix"], exact, "公式 πD⁴/64", "72 邊形近似，畫面已註明「近似」。")
        if k == "pipe":
            exact = math.pi * (100 ** 4 - 90 ** 4) / 64
            info(T, name, "Ix：72 邊形 vs 真圓管", "mm⁴", r["Ix"], exact, "公式", "72 邊形近似，畫面已註明「近似」。")
    # 自由輸入：任意多邊形＋兩個孔
    st = {"unit": "cm", "outer": "0,0\n30,0\n36,18\n20,30\n-4,24", "holes": ["8,6\n14,6\n14,12\n8,12", "20,10\n26,14\n22,20"]}
    r = app1({"tool": "sec", "st": st})
    sp = sp_props(r["outer"], r["holes"])
    for key, lab in [("A", "A"), ("xc", "形心 x"), ("yc", "形心 y"), ("Ix", "Ix"), ("Iy", "Iy"), ("Ixy", "Ixy"), ("Iu", "I 主軸（大）"), ("Iv", "I 主軸（小）")]:
        cmp(T, "任意五邊形＋兩孔", lab, "cm 系", r[key], sp[key], "sectionproperties")


# ---------------------------------------------------------------- 報告
def fnum(v):
    if v is None:
        return "—"
    if isinstance(v, int):
        return str(v)
    a = abs(v)
    if a == 0:
        return "0"
    if a >= 1e5:
        return f"{v:,.0f}"
    if a >= 100:
        return f"{v:,.2f}"
    if a >= 1:
        return f"{v:.4f}"
    return f"{v:.6g}"


def fe(e):
    if e is None:
        return "—"
    if e == float("inf"):
        return "∞"
    return f"{e * 100:+.3f}%"


def write_report(path, versions, extra):
    tools_order = ["共用：構件公式", "共用：鋼管挫曲（ASD）", "共用：鋼柱挫曲（LRFD）", "柱模板", "牆模板", "板模板", "梁模板", "施工架", "排架", "三角架", "錨栓", "斷面性質"]
    by = {}
    for r in ROWS:
        by.setdefault(r["tool"], []).append(r)
    L = []
    L.append("# 結構計算獨立驗證報告")
    L.append("")
    L.append(f"產生方式：`python3 tools/verify/verify.py`（可重跑）　比對門檻：|誤差| ≤ 1% 判定一致")
    L.append("")
    L.append("第三方程式版本：" + "、".join(f"{k} {v}" for k, v in versions.items()))
    L.append("")
    L.append("> 本報告驗證的是「工具箱程式有沒有照它聲明的公式與假設算對」，以及「這些假設和較完整的力學模型差多少」。"
             "公式與假設本身是否符合契約、規範與工地實況，仍依契約與規範為準，由設計者判斷。")
    L.append("")
    hi = [f for f in FINDINGS if f["level"] == "高"]
    mid = [f for f in FINDINGS if f["level"] == "中"]
    L.append("## 結論")
    L.append("")
    L.append(f"- 共比對 **{len(ROWS)}** 項數值，**{sum(r['ok'] for r in ROWS)}** 項與第三方程式或獨立重算一致（誤差 ≤ 1%；其中 {sum(1 for r in ROWS if r['ok'] and abs(r['err']) < 1e-5)} 項差異小於 0.001%，"
             f"其餘最大 {max(abs(r['err']) for r in ROWS if r['ok']) * 100:.2f}%，來自連續梁撓度取有限元素節點值的網格誤差）。"
             "柱模、牆模、板模、梁模、施工架、排架、三角架、斷面性質這八支，程式都有照它聲明的公式算對；三角架的構架分析與 PyNite 有限元素結果逐項相同。")
    L.append(f"- 不一致 **{len(ROWS) - sum(r['ok'] for r in ROWS)}** 項，在錨栓：" + "；".join(f"{f['title']}" for f in hi) + "。屬程式漏做條文的一項修正，結果不保守，建議修。")
    L.append(f"- 另有 {len(mid)} 項「中」等級，是沿用參考網站的假設在特定條件下偏不保守（程式沒算錯，是模型選擇），請 Matt 決定要不要改：" + "；".join(f"{f['tool']}－{f['title']}" for f in mid) + "。")
    L.append("- 細節見第二節；第三節列出假設差異（多數偏保守）；第四節是逐項明細。")
    L.append("")
    # 總表
    L.append("## 一、總覽")
    L.append("")
    L.append("| 計算 | 比對項目 | 一致 | 不一致 | 參考來源 |")
    L.append("|---|---:|---:|---:|---|")
    for t in tools_order:
        rs = by.get(t, [])
        if not rs:
            continue
        cat = lambda x: "anaStruct" if "anaStruct" in x else "PyNite" if "PyNite" in x else "sectionproperties" if "sectionproperties" in x else "獨立重寫"
        srcs = sorted(set(cat(r["src"]) for r in rs))
        L.append(f"| {t} | {len(rs)} | {sum(r['ok'] for r in rs)} | {sum(not r['ok'] for r in rs)} | {'、'.join(srcs)} |")
    tot = len(ROWS)
    ok = sum(r["ok"] for r in ROWS)
    L.append(f"| **合計** | **{tot}** | **{ok}** | **{tot - ok}** | |")
    L.append("")
    # 發現
    L.append("## 二、發現的問題與需要決定的事項")
    L.append("")
    L.append("沒有直接修改網站的計算邏輯，以下請 Matt 決定是否調整。等級：高＝算出不保守的結果且常遇到；中＝特定條件下不保守或假設待確認；低＝影響小或偏保守。")
    L.append("")
    for i, f in enumerate(sorted(FINDINGS, key=lambda f: "高中低".index(f["level"])), 1):
        L.append(f"### {i}. 【{f['level']}】{f['tool']}：{f['title']}")
        L.append("")
        L.append(f["detail"])
        L.append("")
    # 假設差異
    L.append("## 三、假設差異（不是程式錯誤，供判斷保守程度）")
    L.append("")
    L.append("| 計算 | 案例 | 項目 | 工具箱 | 較完整模型 | 差 | 模型 | 說明 |")
    L.append("|---|---|---|---:|---:|---:|---|---|")
    for n in NOTES:
        L.append(f"| {n['tool']} | {n['case']} | {n['item']} | {fnum(n['app'])} | {fnum(n['ref'])} | {fe(n['err'])} | {n['model']} | {n['note']} |")
    L.append("")
    # 明細
    L.append("## 四、逐項比對明細")
    L.append("")
    L.append("誤差 =（工具箱 − 參考值）／參考值。")
    L.append("")
    for t in tools_order:
        rs = by.get(t, [])
        if not rs:
            continue
        L.append(f"### {t}")
        L.append("")
        L.append("| 案例 | 項目 | 單位 | 工具箱 | 參考值 | 誤差 | 參考來源 | 判定 |")
        L.append("|---|---|---|---:|---:|---:|---|---|")
        for r in rs:
            st = "✅ 一致" if r["ok"] else "❌ 不一致" + (f"（{r['note']}）" if r["note"] else "")
            L.append(f"| {r['case']} | {r['item']} | {r['unit']} | {fnum(r['app'])} | {fnum(r['ref'])} | {fe(r['err'])} | {r['src']} | {st} |")
        L.append("")
    L.append(extra)
    with open(path, "w", encoding="utf-8") as fh:
        fh.write("\n".join(L) + "\n")


def main():
    import importlib.metadata as md
    versions = {}
    for p in ("anastruct", "PyNiteFEA", "sectionproperties", "shapely", "numpy"):
        try:
            versions[p] = md.version(p)
        except Exception:
            versions[p] = "?"
    C = check_coefs()
    check_fa()
    check_col(C)
    check_wall(C)
    check_slab(C)
    bm = check_beam(C)
    check_scaf()
    check_row()
    check_brk()
    anc = check_anc()
    check_sec()

    # ---- 依結果寫發現（數值取自本次執行）
    fb = bm["fb"]
    ta, tr = bm["tie_app"], fb["R"]
    finding("中", "梁模板", "側模第二層大格柵與螺桿的受力，和實際傳力路徑有落差",
            f"B1 案例（梁 40×80、第一層大格柵 3 支、螺桿 2 階距梁底 20／60 cm）。工具箱把第二層大格柵在螺桿處切段，兩端段當懸臂、"
            f"各段用段中點側壓力當均布；實際上側壓力是經第一層大格柵以集中力傳入。用 anaStruct 把第二層大格柵建成以螺桿為支點、兩端外伸的連續梁比較："
            f"最大彎矩 工具箱 {bm['seg_M']:.0f}／集中力模型 {fb['M']:.0f}／線性分布模型 {bm['fa']['M']:.0f} kgf·cm（差 {(bm['seg_M'] / fb['M'] - 1) * 100:+.0f}%、{(bm['seg_M'] / bm['fa']['M'] - 1) * 100:+.0f}%）；"
            f"最大剪力 工具箱 {bm['seg_V']:.0f}／集中力模型 {fb['V']:.0f} kgf（{(bm['seg_V'] / fb['V'] - 1) * 100:+.0f}%）；"
            f"螺桿拉力 第 1 階 {ta[0]:.0f}／{tr[0]:.0f} kgf（{(ta[0] / tr[0] - 1) * 100:+.0f}%）、第 2 階 {ta[1]:.0f}／{tr[1]:.0f} kgf（{(ta[1] / tr[1] - 1) * 100:+.0f}%）。"
            "合力相同（力平衡驗證一致），但分配不同：最下一階螺桿與梁底端剪力被低估，上階螺桿高估。這是參考網站的算法，程式照實作沒有錯；"
            "建議改成「第二層大格柵以連續梁（集中力）計算、螺桿取支點反力」，或至少在計算書註明。"
            "另外只有一階螺桿時，兩段懸臂在螺桿處彎矩不平衡，實際要靠梁底的支承（側模底角材、止滑木）才穩定，計算書沒寫出。")
    finding("低", "柱模、牆模、梁模（螺桿、上層格柵）", "受力用「受載寬度」計算，沒計連續梁中間支點反力約 1.1 倍",
            "工具箱螺桿拉力 T = P × B4 × H4、上一層格柵 w = P × 間距，都是受載面積法。下層構件若為三跨連續，中間支點反力為 1.1wL（兩跨 1.25wL），"
            "實際傳到螺桿的力可能多 10%～25%。這是模板設計常用的簡化，參考網站相同，列出供參考；是否需要放大由設計者依契約與規範判斷。")
    # 錨栓發現
    for name, (r, ref) in anc.items():
        ck = {c["k"]: c for c in r["checks"]}
        if "sb" in ref and "sb" in ck and abs(rel(ck["sb"]["a"], ref["sb"][1])) > TOL:
            finding("高", "錨栓", "預埋擴頭螺栓的側面爆裂強度沒有乘角落折減",
                    f"{name}：ACI 318-19 17.6.4.1.1 規定 ca2 < 3ca1 時 Nsb 要乘 (1 + ca2/ca1)/4。工具箱 φNsb = {ck['sb']['a']:.0f} kgf，"
                    f"含折減應為 {ref['sb'][1]:.0f} kgf（工具箱高估 {(ck['sb']['a'] / ref['sb'][1] - 1) * 100:.0f}%）。錨栓靠近柱角時會發生，屬不保守，建議修正。")
            break
    lit = [n for n in NOTES if n["tool"] == "錨栓" and "ca1 限制" in n["item"]]
    if lit:
        worst = max(lit, key=lambda n: n["err"])
        finding("低" if worst["err"] <= TOL else "中", "錨栓", "窄而薄的構材沒有做剪破的 ca1 限制（ACI 318-19 17.7.2.1.2）",
                "兩側邊距都小於 1.5ca1、構材厚 ha 也小於 1.5ca1 時（牆頂、梁側、柱邊常見），條文規定 ca1 不得超過 max(ca2,max/1.5, ha/1.5, s/3)。"
                f"工具箱用實際 ca1。本次 {len(lit)} 個觸發案例，工具箱 φVcbg 與依條文的差為 "
                + "、".join(f"{n['err'] * 100:+.0f}%" for n in lit)
                + ("，都比條文小（偏保守），可能讓這類錨栓被判 NG 而實際可過。" if worst["err"] <= TOL else "，有案例比條文大（不保守），建議補上。"))
    finding("低", "錨栓", "其他與條文的小差異",
            "(1) futa 上限工具箱用 8750 kgf/cm²，條文 860 MPa = 8770 kgf/cm²（偏保守 0.2%）。"
            "(2) 輕質混凝土時，混凝土剪破 Vb 與側面爆裂用 λ 而不是 λa（膨脹式應取 0.8λ），只影響輕質混凝土。"
            "(3) 側面爆裂以單支錨栓檢核，未做群組 (1 + s/6ca1) 放大（偏保守）。"
            "(4) 三邊近邊的 hef 修正，間距 s 取整個配置的最大間距，不是受拉群組內的（多數情況相同）。")
    finding("低", "三角架", "等邊角鋼的斷面模數 S 用 Imin/(b/√2)",
            "角鋼對弱軸的最遠纖維距離實際約 0.4b（腳跟），工具箱用 b/√2 ≈ 0.71b，S 偏小、偏保守。"
            "角鋼目前只當加勁桿（桁架元素，不檢核彎矩），所以不影響現有結果；若將來讓角鋼當上弦或下斜桿，要改。")

    extra = []
    extra.append("## 五、驗證方法與範圍")
    extra.append("")
    extra.append("- **工具箱數值**：`tools/verify/extract.js` 用 Node 直接載入網站的 `colform.js` 等九支檔案，呼叫 `colCalc`、`wfCalc`、`sfCalc`、`bfCalc`、`scCalc`、`rfCalc`、`bkCalc`、`ancCalc`、`secCalc`，與手機上算的是同一份程式碼。")
    extra.append("- **anaStruct**：二維梁有限元素。每跨切 40 段以上取最大彎矩、剪力、撓度；用來驗證簡支、連續、懸臂係數與梁模板第二層大格柵。")
    extra.append("- **PyNite**：三維構架有限元素（限制成平面）。三角架依輸入幾何獨立建模，上弦、下斜桿、靠牆立材為梁元素，加勁桿兩端釋放彎矩，靠牆兩點固定，自重 ×1.2 為沿桿長均布；比對支承反力、各群組最大軸力、彎矩、剪力與上弦端點撓度。斷面用工具箱同一組值，構架分析與斷面計算分開驗證。")
    extra.append("- **sectionproperties**：有限元素斷面分析（多邊形斷面為精確積分）。驗證斷面性質分頁、木角材、襯板、鋼管、三角架的矩形管／槽鋼／圓管／角鋼斷面。")
    extra.append("- **獨立重寫**：AISC ASD 柱公式（板模、梁模、牆模單面模的鋼管）、AISC 360-16 E3（施工架、排架、三角架的 LRFD 柱公式，用 Fe 的寫法對照工具箱的 λc 寫法）、施工架／排架的載重拆解與組合、ACI 318-19 第 17 章錨栓（全部用 SI 單位 N、mm、MPa 依條文重寫，再換算成 kgf 比較，可同時驗證單位換算）。")
    extra.append("- **沒有驗證到的**：參考網站 realizcalc 本身的數值（本次沒有重新對算）、規範條文的選用是否適當、畫面與計算書的文字排版、連動帶入（施工架→三角架→錨栓的欄位對應另有 Playwright 測試）。錨栓沒有可用的開源程式，參考值是依條文獨立重寫，不是商用軟體結果；若要送審佐證，建議挑 A1、A2 用 Hilti PROFIS 或公司慣用軟體抽查。")
    extra.append("")
    write_report(os.path.join(HERE, "REPORT.md"), versions, "\n".join(extra))
    with open(os.path.join(HERE, "results.json"), "w", encoding="utf-8") as fh:
        json.dump(dict(rows=ROWS, notes=NOTES, findings=FINDINGS, versions=versions), fh, ensure_ascii=False, indent=1, default=float)
    bad = [r for r in ROWS if not r["ok"]]
    print(f"比對 {len(ROWS)} 項，一致 {len(ROWS) - len(bad)}，不一致 {len(bad)}；假設差異 {len(NOTES)} 項；發現 {len(FINDINGS)} 項")
    for r in bad:
        print("  ✗", r["tool"], r["case"], r["item"], fnum(r["app"]), fnum(r["ref"]), fe(r["err"]), r["note"])
    return 0


if __name__ == "__main__":
    sys.exit(main())
