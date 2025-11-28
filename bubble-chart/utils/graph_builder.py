# utils/graph_builder.py
import pandas as pd
import json
import os
from datetime import datetime, timezone
from collections import defaultdict

# keep your scoring helpers here; ensure utils/scoring.py exports these
from utils.scoring import freelancer_credibility_score, company_risk_score, edge_strength_from_history

DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "data")
# adjust if your CSVs are in a subfolder

# Filenames (match the CSVs you uploaded)
JOBS_CSV = os.path.join(DATA_DIR, "dummy_job_feed_v2.csv")
INVOICES_CSV = os.path.join(DATA_DIR, "overdue_invoices.csv")
TXNS_CSV = os.path.join(DATA_DIR, "setu_account_response_v2.csv")
FREELANCERS_CSV = os.path.join(DATA_DIR, "freelancers_profile.csv")
CLIENTS_CSV = os.path.join(DATA_DIR, "clients_profile.csv")
CAL_EVENTS_CSV = os.path.join(DATA_DIR, "calendar_events_v2.csv")

# cache file for summary JSON to speed up repeated calls
CACHE_JSON = os.path.join(DATA_DIR, "graph_summary_cache.json")


def safe_read_csv(path):
    try:
        if not os.path.exists(path):
            print(f"[WARN] Could not read {path}: file not found")
            return pd.DataFrame()
        return pd.read_csv(path)
    except Exception as e:
        print(f"[WARN] Could not read {path}: {e}")
        return pd.DataFrame()


def to_iso(dt):
    if pd.isna(dt):
        return None
    if isinstance(dt, str):
        try:
            return pd.to_datetime(dt).isoformat()
        except Exception:
            return dt
    if isinstance(dt, (pd.Timestamp, datetime)):
        try:
            return pd.to_datetime(dt).isoformat()
        except Exception:
            return str(dt)
    return None


def load_all():
    jobs = safe_read_csv(JOBS_CSV)
    invoices = safe_read_csv(INVOICES_CSV)
    txns = safe_read_csv(TXNS_CSV)
    freelancers = safe_read_csv(FREELANCERS_CSV)
    clients = safe_read_csv(CLIENTS_CSV)
    cal = safe_read_csv(CAL_EVENTS_CSV)
    return {
        "jobs": jobs,
        "invoices": invoices,
        "txns": txns,
        "freelancers": freelancers,
        "clients": clients,
        "calendar": cal
    }


def build_summary(force_recompute=False):
    """
    Build a graph summary suitable for the frontend bubble chart.
    Returns dict: { nodes: [...], links: [...], meta: {...} }
    """
    if os.path.exists(CACHE_JSON) and not force_recompute:
        try:
            with open(CACHE_JSON, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass

    data = load_all()
    jobs = data["jobs"]
    inv = data["invoices"]
    txns = data["txns"]
    fr = data["freelancers"]
    cl = data["clients"]
    cal = data["calendar"]

    # Create lookup maps: companies / clients
    comp_map = {}
    # prefer clients_profile.csv mapping if present
    if not cl.empty and "company_id" in cl.columns:
        # index by company_id
        comp_map = cl.groupby("company_id").apply(lambda df: df.to_dict(orient="records")).to_dict()
    else:
        # fallback: attempt to build from invoices
        if not inv.empty and "company_id" in inv.columns and "company_name" in inv.columns:
            comp_map = inv.set_index("company_id").to_dict(orient="index")
        else:
            # last fallback: use distinct company_id values from jobs and create minimal metadata
            if not jobs.empty and "company_id" in jobs.columns:
                for cid in jobs["company_id"].dropna().unique().tolist():
                    comp_map[str(cid)] = {"company_name": str(cid)}

    # Freelancer map (support different column names)
    fr_map = {}
    if not fr.empty:
        # prefer a canonical 'freelancer_id' column (your generated file uses this)
        if "freelancer_id" in fr.columns:
            fr_map = fr.set_index("freelancer_id").to_dict(orient="index")
        elif "related_freelancer_id" in fr.columns:
            fr_map = fr.set_index("related_freelancer_id").to_dict(orient="index")
        elif "user_id" in fr.columns:
            fr_map = fr.set_index("user_id").to_dict(orient="index")
    else:
        # fallback: build from invoices
        if not inv.empty and "related_freelancer_id" in inv.columns:
            for fid in inv["related_freelancer_id"].dropna().unique().tolist():
                fr_map[str(fid)] = {"name": str(fid)}

    # Build nodes
    nodes = {}
    # company nodes
    for cid, meta in comp_map.items():
        # meta may be a dict of columns
        name = None
        if isinstance(meta, dict):
            name = meta.get("company_name") or meta.get("companyName") or str(cid)
        else:
            name = str(cid)
        industry = meta.get("industry") if isinstance(meta, dict) else None
        nodes[str(cid)] = {
            "id": str(cid),
            "type": "company",
            "name": name,
            "industry": industry,
            "meta": meta
        }

    # freelancer nodes
    for fid, meta in fr_map.items():
        # compute a baseline credibility score from metadata where possible
        avg_days = 0
        review_count = 0
        if isinstance(meta, dict):
            avg_days = float(meta.get("avg_days_to_pay") or meta.get("avg_delay_days") or 0)
            review_count = int(meta.get("total_reviews") or meta.get("review_count") or 0)
        score = freelancer_credibility_score(avg_days, review_count, disputes=0)
        nodes[str(fid)] = {
            "id": str(fid),
            "type": "freelancer",
            "name": (meta.get("name") if isinstance(meta, dict) else str(fid)),
            "credibility_score": score,
            "meta": meta
        }

    # Build edges aggregation: company <-> freelancer
    edge_agg = defaultdict(lambda: {"num_projects": 0, "total_amount": 0.0, "last_active": None, "job_ids": set(), "invoice_ids": set()})

    # 1) Use invoices to join companies and freelancers if present
    if not inv.empty and "company_id" in inv.columns and "related_freelancer_id" in inv.columns:
        for _, r in inv.iterrows():
            cid = r.get("company_id")
            fid = r.get("related_freelancer_id")
            # skip NaNs
            if pd.isna(cid) or pd.isna(fid):
                continue
            cid = str(cid); fid = str(fid)
            try:
                amt = float(r.get("amount_due") or 0)
            except Exception:
                amt = 0.0
            iid = r.get("invoice_id") if "invoice_id" in inv.columns else None
            dt = r.get("last_communication_at") or r.get("due_date") or None
            key = (cid, fid)
            edge_agg[key]["num_projects"] += 1
            edge_agg[key]["total_amount"] += amt
            if iid and not pd.isna(iid):
                edge_agg[key]["invoice_ids"].add(str(iid))
            if dt and not pd.isna(dt):
                try:
                    dts = pd.to_datetime(dt)
                    if edge_agg[key]["last_active"] is None or dts > edge_agg[key]["last_active"]:
                        edge_agg[key]["last_active"] = dts
                except Exception:
                    pass

    # 2) Fallback: use jobs (company_id + assigned_freelancer_id)
    if not jobs.empty and "company_id" in jobs.columns:
        for _, r in jobs.iterrows():
            cid = r.get("company_id")
            fid = r.get("assigned_freelancer_id") or r.get("assigned_freelancer") or None
            if pd.isna(cid) or pd.isna(fid):
                continue
            cid = str(cid); fid = str(fid)
            jid = r.get("job_id") or r.get("id") or None
            key = (cid, fid)
            edge_agg[key]["num_projects"] += 1
            if jid and not pd.isna(jid):
                edge_agg[key]["job_ids"].add(str(jid))

    # 3) Augment edges using transactions (matching invoices/job ids if present)
    if not txns.empty:
        for _, t in txns.iterrows():
            rid = None
            if "related_invoice_id" in txns.columns and pd.notna(t.get("related_invoice_id")):
                rid = str(t.get("related_invoice_id"))
            rjob = None
            if "related_job_id" in txns.columns and pd.notna(t.get("related_job_id")):
                rjob = str(t.get("related_job_id"))
            try:
                amt = float(t.get("amount") or 0)
            except Exception:
                amt = 0.0
            tdate = t.get("date") or t.get("created_at") or None

            if rid and not inv.empty and "invoice_id" in inv.columns:
                inv_row = inv[inv["invoice_id"].astype(str) == rid]
                if not inv_row.empty:
                    cid = inv_row.iloc[0].get("company_id") if "company_id" in inv_row.columns else None
                    fid = inv_row.iloc[0].get("related_freelancer_id") if "related_freelancer_id" in inv_row.columns else None
                    if pd.notna(cid) and pd.notna(fid):
                        key = (str(cid), str(fid))
                        edge_agg[key]["total_amount"] += amt
                        edge_agg[key]["invoice_ids"].add(rid)
                        if tdate:
                            try:
                                dts = pd.to_datetime(tdate)
                                if edge_agg[key]["last_active"] is None or dts > edge_agg[key]["last_active"]:
                                    edge_agg[key]["last_active"] = dts
                            except Exception:
                                pass

            if rjob and not jobs.empty and "job_id" in jobs.columns:
                job_row = jobs[jobs["job_id"].astype(str) == rjob]
                if not job_row.empty:
                    cid = job_row.iloc[0].get("company_id")
                    fid = job_row.iloc[0].get("assigned_freelancer_id") or None
                    if pd.notna(cid) and pd.notna(fid):
                        key = (str(cid), str(fid))
                        edge_agg[key]["total_amount"] += amt
                        if tdate:
                            try:
                                dts = pd.to_datetime(tdate)
                                if edge_agg[key]["last_active"] is None or dts > edge_agg[key]["last_active"]:
                                    edge_agg[key]["last_active"] = dts
                            except Exception:
                                pass

    # Build final links list
    links = []
    now_ts = pd.Timestamp.now(tz=timezone.utc)
    for (cid, fid), meta in edge_agg.items():
        num_projects = int(meta["num_projects"] or 0)
        total_amount = float(meta["total_amount"] or 0.0)
        last_active = meta["last_active"]
        if last_active is None:
            last_active_days = 9999
        else:
            try:
                last_active_days = int((now_ts - pd.to_datetime(last_active)).days)
            except Exception:
                last_active_days = 9999
        strength = edge_strength_from_history(num_projects, total_amount, last_active_days)
        links.append({
            "source": cid,
            "target": fid,
            "num_projects": num_projects,
            "total_amount": round(total_amount, 2),
            "last_active": to_iso(last_active) if last_active is not None else None,
            "job_ids": list(meta["job_ids"]),
            "invoice_ids": list(meta["invoice_ids"]),
            "weight": strength
        })

    # Aggregates for nodes
    company_aggregates = defaultdict(lambda: {"total_revenue": 0.0, "jobs_posted": 0, "invoices": 0, "overdue": 0, "avg_days_to_pay": 0.0})
    freelancer_aggregates = defaultdict(lambda: {"total_revenue": 0.0, "invoices": 0, "avg_days_to_pay": 0.0, "review_count": 0})

    # invoices aggregations
    if not inv.empty and "company_id" in inv.columns:
        for _, r in inv.iterrows():
            cid = r.get("company_id")
            fid = r.get("related_freelancer_id") if "related_freelancer_id" in r else None
            if pd.isna(cid):
                continue
            cid = str(cid)
            try:
                amt = float(r.get("amount_due") or 0)
            except Exception:
                amt = 0.0
            days = float(r.get("days_overdue") or 0) if "days_overdue" in inv.columns else 0.0
            status = str(r.get("status") or "").upper() if "status" in inv.columns else ""
            company_aggregates[cid]["total_revenue"] += amt
            company_aggregates[cid]["invoices"] += 1
            company_aggregates[cid]["overdue"] += (1 if status == "OVERDUE" else 0)
            company_aggregates[cid]["avg_days_to_pay"] += days
            if pd.notna(fid):
                fid = str(fid)
                freelancer_aggregates[fid]["total_revenue"] += amt
                freelancer_aggregates[fid]["invoices"] += 1
                freelancer_aggregates[fid]["avg_days_to_pay"] += days

    # jobs aggregations
    if not jobs.empty and "company_id" in jobs.columns:
        for _, r in jobs.iterrows():
            cid = r.get("company_id")
            if pd.isna(cid):
                continue
            cid = str(cid)
            company_aggregates[cid]["jobs_posted"] += 1

    # finalize avg computations
    for cid, agg in company_aggregates.items():
        if agg["invoices"] > 0:
            agg["avg_days_to_pay"] = agg["avg_days_to_pay"] / agg["invoices"]
        else:
            agg["avg_days_to_pay"] = 0.0

    for fid, agg in freelancer_aggregates.items():
        if agg["invoices"] > 0:
            agg["avg_days_to_pay"] = agg["avg_days_to_pay"] / agg["invoices"]
        else:
            agg["avg_days_to_pay"] = 0.0

    # attach aggregates to nodes
    for node_id, node in list(nodes.items()):
        if node["type"] == "company":
            agg = company_aggregates.get(node_id, {})
            node["total_revenue"] = round(float(agg.get("total_revenue", 0.0)), 2)
            node["jobs_posted"] = int(agg.get("jobs_posted", 0))
            overdue = int(agg.get("overdue", 0))
            invs = int(agg.get("invoices", 0))
            overdue_ratio = (overdue / invs) if invs > 0 else 0.0
            node["risk_score"] = company_risk_score(overdue_ratio, agg.get("avg_days_to_pay", 0.0))
        else:
            agg = freelancer_aggregates.get(node_id, {})
            node["total_revenue"] = round(float(agg.get("total_revenue", 0.0)), 2)
            node["projects_count"] = int(agg.get("invoices", 0))
            node["avg_days_to_pay"] = round(agg.get("avg_days_to_pay", 0.0), 2)
            # get review count from meta if present
            review_count = 0
            meta = node.get("meta") or {}
            try:
                review_count = int(meta.get("total_reviews") or meta.get("review_count") or 0)
            except Exception:
                review_count = 0
            node["credibility_score"] = freelancer_credibility_score(node.get("avg_days_to_pay", 0.0), review_count, disputes=0)

    # prepare payload
    payload = {
        "nodes": list(nodes.values()),
        "links": links,
        "meta": {
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "node_count": len(nodes),
            "link_count": len(links)
        }
    }

    # cache to file
    try:
        with open(CACHE_JSON, "w", encoding="utf-8") as f:
            json.dump(payload, f, default=str)
    except Exception as e:
        print("[WARN] could not cache graph summary:", e)

    return payload


def get_subgraph(center_id: str, depth: int = 1):
    """
    Return nodes and links within `depth` hops of center_id.
    Uses BFS on the precomputed summary graph.
    """
    summary = build_summary()
    nodes = {n["id"]: n for n in summary.get("nodes", [])}
    # build adjacency from links
    adj = {}
    for l in summary.get("links", []):
        s = l["source"]; t = l["target"]
        adj.setdefault(s, set()).add(t)
        adj.setdefault(t, set()).add(s)

    # BFS
    visited = set([center_id])
    frontier = set([center_id])
    for _ in range(depth):
        new_frontier = set()
        for n in frontier:
            for nb in adj.get(n, []):
                if nb not in visited:
                    new_frontier.add(nb)
                    visited.add(nb)
        frontier = new_frontier
        if not frontier:
            break

    sub_nodes = [nodes[nid] for nid in visited if nid in nodes]
    sub_links = [l for l in summary.get("links", []) if l["source"] in visited and l["target"] in visited]
    return {"nodes": sub_nodes, "links": sub_links}
