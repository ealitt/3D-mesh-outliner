from __future__ import annotations

from pathlib import Path

from typer.testing import CliRunner

from mesh2cad.cli import app

FIXTURES = Path(__file__).parent / "fixtures"


def test_project_command_writes_svg_and_dxf(tmp_path):
    runner = CliRunner()
    svg_path = tmp_path / "cube.svg"
    dxf_path = tmp_path / "cube.dxf"

    result = runner.invoke(
        app,
        [
            "project",
            str(FIXTURES / "cube.stl"),
            "--view",
            "top",
            "--source-units",
            "mm",
            "--svg",
            str(svg_path),
            "--dxf",
            str(dxf_path),
        ],
    )

    assert result.exit_code == 0
    assert svg_path.exists()
    assert dxf_path.exists()
    assert "Body count: 1" in result.output
