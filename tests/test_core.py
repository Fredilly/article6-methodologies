import sys
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parents[1]))

from core.engine import run_engine
from core.risk_layer import assess_risk
from core.utils import load_json, save_json
from core.audit_export import export_report


def test_core_components(tmp_path):
    result = run_engine({"project": "demo"})
    assert result["status"] == "success"

    assert assess_risk({"project": "demo"}) == "low"

    data = {"hello": "world"}
    json_path = tmp_path / "data.json"
    save_json(data, json_path)
    assert load_json(json_path) == data

    report_path = tmp_path / "report.txt"
    export_report(data, report_path)
    assert report_path.read_text() == "Placeholder report"
