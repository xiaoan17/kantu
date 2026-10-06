#!/usr/bin/env python3
"""One-off: update IF / JCR / CAS partitions for all journals (2024 JIF + CAS 2025-03).
Data collected via web research (LetPub/科研通/武大图书馆系统 cross-verified)."""
import json

# id -> (impactFactor, jcrQuartile, casMajor, casMinor)
U = {
    "etransportation": (17.0, "Q1", "材料科学(1区)", "能源与燃料(1区)工程:电子与电气(1区)运输科技(1区)"),
    "communications-in-transportation-research": (14.5, "Q1", "工程技术(1区)", "交通运输(1区)运输科技(1区)"),
    "ieee-transactions-on-intelligent-vehicles": (14.3, "Q1", "计算机科学(1区)", "计算机:人工智能(2区)工程:电子与电气(2区)运输科技(2区)"),
    "analytic-methods-in-accident-research": (12.6, "Q1", "工程技术(1区)", "公共卫生、环境卫生与职业卫生(1区)交通运输(1区)"),
    "automation-in-construction": (11.5, "Q1", "工程技术(1区)", "结构与建筑技术(1区)工程:土木(1区)"),
    "transport-reviews": (9.9, "Q1", "工程技术(1区)", "交通运输(2区)"),
    "computer-aided-civil-and-infrastructure-engineering": (9.1, "Q1", "工程技术(1区)", "计算机:跨学科应用(1区)结构与建筑技术(1区)工程:土木(1区)运输科技(1区)"),
    "transportation-research-part-e": (8.8, "Q1", "工程技术(1区)", "经济学(1区)工程:土木(1区)运筹学与管理科学(1区)交通运输(1区)运输科技(2区)"),
    "ieee-transactions-on-intelligent-transportation-systems": (8.4, "Q1", "计算机科学(2区)", "工程:土木(1区)工程:电子与电气(2区)运输科技(2区)"),
    "ieee-transactions-on-transportation-electrification": (8.3, "Q1", "工程技术(1区)", "工程:电子与电气(1区)运输科技(2区)"),
    "construction-and-building-materials": (8.0, "Q1", "工程技术(1区)", "工程:土木(1区)结构与建筑技术(2区)材料科学:综合(2区)"),
    "transportation-research-part-c": (7.9, "Q1", "工程技术(1区)", "运输科技(1区)"),
    "journal-of-intelligent-and-connected-vehicles": (7.8, "Q1", None, None),
    "transportation-research-part-d": (7.7, "Q1", "工程技术(1区)", "交通运输(2区)运输科技(2区)环境研究(2区)"),
    "tunnelling-and-underground-space-technology": (7.4, "Q1", "工程技术(1区)", "结构与建筑技术(1区)工程:土木(1区)"),
    "ieee-vehicular-technology-magazine": (7.2, "Q1", "计算机科学(3区)", "工程:电子与电气(3区)电信学(3区)运输科技(3区)"),
    "ieee-transactions-on-vehicular-technology": (7.1, "Q1", "计算机科学(2区)", "工程:电子与电气(2区)电信学(2区)运输科技(3区)"),
    "journal-of-traffic-and-transportation-engineering-english-edition": (6.8, "Q1", "工程技术(2区)", "工程:土木(2区)运输科技(2区)"),
    "transportation-research-part-a": (6.8, "Q1", "工程技术(1区)", "经济学(1区)交通运输(2区)运输科技(2区)"),
    "case-studies-in-construction-materials": (6.6, "Q1", "工程技术(2区)", "结构与建筑技术(2区)工程:土木(2区)材料科学:综合(2区)"),
    "vehicular-communications": (6.5, "Q1", "计算机科学(2区)", "电信学(2区)运输科技(3区)"),
    "journal-of-transport-geography": (6.3, "Q1", "工程技术(1区)", "经济学(2区)地理学(2区)交通运输(2区)"),
    "transportation-research-part-b": (6.3, "Q1", "工程技术(1区)", "工程:土木(1区)运筹学与管理科学(1区)经济学(2区)交通运输(2区)运输科技(2区)"),
    "accident-analysis-and-prevention": (6.2, "Q1", "工程技术(1区)", "人体工程学(1区)公共卫生、环境卫生与职业卫生(1区)社会科学:跨领域(1区)交通运输(2区)"),
    "travel-behaviour-and-society": (5.7, "Q1", "工程技术(1区)", "交通运输(2区)"),
    "ieee-open-journal-of-intelligent-transportation-systems": (5.3, "Q2", "工程技术(2区)", "计算机:人工智能(3区)工程:电子与电气(3区)运输科技(3区)"),
    "transport-policy": (5.3, "Q1", "工程技术(1区)", "经济学(2区)交通运输(2区)"),
    "ieee-intelligent-transportation-systems-magazine": (5.0, "Q1", "工程技术(3区)", "工程:电子与电气(3区)运输科技(4区)"),
    "maritime-economics-logistics": (4.8, "Q1", "管理学(4区)", "交通运输(4区)"),
    "transportation-science": (4.8, "Q1", "工程技术(2区)", "运筹学与管理科学(3区)交通运输(3区)运输科技(3区)"),
    "journal-of-safety-research": (4.4, "Q1", "工程技术(2区)", "人体工程学(2区)公共卫生、环境卫生与职业卫生(2区)社会科学:跨领域(2区)交通运输(3区)"),
    "research-in-transportation-business-and-management": (4.4, "Q2", "工程技术(2区)", "交通运输(3区)商业:管理(4区)管理学(4区)"),
    "transportation-research-part-f": (4.4, "Q1", "工程技术(2区)", "心理学:应用(3区)交通运输(3区)"),
    "european-transport-research-review": (4.2, "Q2", "工程技术(2区)", "交通运输(3区)运输科技(3区)"),
    "international-journal-of-sustainable-transportation": (3.9, "Q3", "工程技术(3区)", "环境研究(4区)绿色可持续发展技术(4区)交通运输(4区)"),
    "journal-of-public-transportation": (3.7, "Q2", "工程技术(3区)", "交通运输(4区)"),
    "international-journal-of-rail-transportation": (3.6, "Q2", "工程技术(2区)", "运输科技(3区)"),
    "journal-of-air-transport-management": (3.6, "Q2", "工程技术(2区)", "交通运输(3区)"),
    "maritime-policy-management": (3.6, "Q2", "管理学(3区)", "交通运输(4区)"),
    "research-in-transportation-economics": (3.4, "Q1", "工程技术(2区)", "经济学(3区)交通运输(3区)"),
    "transportmetrica-b": (3.4, "Q2", "工程技术(2区)", "交通运输(3区)运输科技(3区)"),
    "international-journal-of-pavement-engineering": (3.3, "Q1", "工程技术(3区)", "结构与建筑技术(3区)工程:土木(3区)材料科学:表征与测试(3区)"),
    "journal-of-transport-health": (3.3, "Q1", "工程技术(3区)", "公共卫生、环境卫生与职业卫生(3区)交通运输(4区)"),
    "transportation": (3.3, "Q2", "工程技术(3区)", "工程:土木(3区)交通运输(4区)运输科技(3区)"),
    "transportation-letters-the-international-journal-of-transportation-research": (3.3, "Q2", "工程技术(3区)", "交通运输(4区)运输科技(3区)"),
    "physica-a-statistical-mechanics-and-its-applications": (3.1, "Q2", "物理与天体物理(2区)", "物理:综合(2区)"),
    "transportmetrica-a-transport-science": (3.1, "Q2", "工程技术(3区)", "运输科技(3区)交通运输(4区)"),
    "journal-of-intelligent-transportation-systems": (2.8, "Q2", "工程技术(3区)", "交通运输(4区)运输科技(4区)"),
    "journal-of-transportation-safety-security": (2.6, "Q3", "工程技术(3区)", "交通运输(4区)"),
    "iet-intelligent-transport-systems": (2.5, "Q3", "工程技术(3区)", "工程:电子与电气(4区)运输科技(4区)"),
    "journal-of-transportation-engineering-part-b-pavements": (2.5, "Q2", "工程技术(4区)", "工程:土木(4区)运输科技(4区)"),
    "journal-of-transport-and-land-use": (2.2, "Q3", "工程技术(4区)", "交通运输(4区)"),
    "international-journal-of-engine-research": (2.1, "Q3", "工程技术(4区)", "工程:机械(4区)热力学(4区)运输科技(4区)"),
    "journal-of-transportation-engineering-part-a-systems": (2.1, "Q3", "工程技术(4区)", "工程:土木(4区)运输科技(4区)"),
    "proceedings-of-the-institution-of-mechanical-engineers-part-f-journal-of-rail-and-rapid-transit": (2.1, "Q2", "工程技术(4区)", "工程:土木(4区)工程:机械(4区)运输科技(4区)"),
    "traffic-injury-prevention": (1.9, "Q3", "工程技术(3区)", "公共卫生、环境卫生与职业卫生(4区)交通运输(4区)"),
    "journal-of-advanced-transportation": (1.8, "Q3", "工程技术(4区)", "工程:土木(4区)运输科技(4区)"),
    "transportation-research-record": (1.8, "Q3", "工程技术(4区)", "工程:土木(4区)运输科技(4区)"),
    "economics-of-transportation": (1.7, "Q2", "工程技术(3区)", "经济学(4区)交通运输(4区)"),
    "international-journal-of-automotive-technology": (1.5, "Q3", "工程技术(4区)", "工程:机械(4区)运输科技(4区)"),
    "networks-spatial-economics": (1.5, "Q3", "工程技术(3区)", "运筹学与管理科学(4区)运输科技(4区)"),
    "proceedings-of-the-institution-of-mechanical-engineers-part-d-journal-of-automobile-engineering": (1.5, "Q3", "工程技术(4区)", "工程:机械(4区)运输科技(4区)"),
    "transport": (1.3, "Q4", "工程技术(4区)", "运输科技(4区)"),
    "international-journal-of-shipping-and-transport-logistics": (1.2, "Q3", "管理学(4区)", "管理学(4区)交通运输(4区)"),
    "transportation-journal": (1.0, "Q4", "管理学(4区)", "管理学(4区)交通运输(4区)"),
    "international-journal-of-vehicle-design": (0.7, "Q4", "工程技术(4区)", "工程:机械(4区)运输科技(4区)"),
    "engineering-applications-of-artificial-intelligence": (8.0, "Q1", "计算机科学(1区)", "工程:综合(1区)自动化与控制系统(2区)计算机:人工智能(2区)工程:电子与电气(2区)"),
    "expert-systems-with-applications": (7.5, "Q1", "计算机科学(1区)", "计算机:人工智能(2区)工程:电子与电气(2区)运筹学与管理科学(2区)"),
    "ocean-engineering": (5.5, "Q1", "工程技术(2区)", "工程:土木(2区)工程:海洋(2区)工程:大洋(2区)海洋学(2区)"),
    "railway-engineering-science": (5.4, "Q1", "工程技术(2区)", "运输科技(3区)"),
    "safety-science": (5.4, "Q1", "工程技术(2区)", "工程:工业(2区)运筹学与管理科学(2区)"),
    "science-of-the-total-environment": (8.0, "Q1", "环境科学与生态学(2区)", "环境科学(2区)"),
}

DROP_IDS = {"transportmetrica-b-transport-dynamics"}  # duplicate of transportmetrica-b (same ISSN)


def norm(s):
    return s.replace("：", ":") if isinstance(s, str) else s


def update(path):
    data = json.load(open(path))
    data = [j for j in data if j["id"] not in DROP_IDS]
    missing = []
    for j in data:
        u = U.get(j["id"])
        if not u:
            missing.append(j["id"])
            continue
        j["impactFactor"], j["jcrQuartile"], j["casMajor"], j["casMinor"] = (
            u[0], u[1], norm(u[2]), norm(u[3]),
        )
    unused = set(U) - {j["id"] for j in data}
    assert not missing, f"no update for: {missing}"
    assert not unused, f"unused update keys: {unused}"
    data.sort(key=lambda j: (j["impactFactor"] is None, -(j["impactFactor"] or 0), j["name"]))
    json.dump(data, open(path, "w"), ensure_ascii=False, indent=2)
    open(path, "a").write("\n")
    print(f"{path}: {len(data)} journals updated")


update("resources/journals.json")
update("resources/journals.seed.json")
