"""
Tessellation error / mesh self-consistency checks  (NOT a machining tolerance check)

What this module does
  - calculate_chordal_deviation / required_segments_for_tolerance:
    how far a polygon (mesh) circle deviates from the true circle. Pure geometry.
  - verify_dimension: compares a number you pass in against a nominal +/- band.

What it does NOT do
  - It does not measure a machined part, and it does not read CAD/B-Rep geometry.
  - When fed values read back from the same mesh that was built from the nominal
    numbers (blender_twin_controller.py), the comparison is self-referential and
    cannot fail. Such a result says nothing about ISO 286 / H7 machining tolerance.

History: the previous version labelled this a "virtual CMM" and printed
"PASSED (Ready for Machining)" for hard-coded example values. See docs/AUDIT.md.
"""
import math
from dataclasses import dataclass
from typing import List, Dict, Any

@dataclass
class ToleranceSpec:
    nominal: float      # Nominal dimension (mm)
    upper_tol: float    # Upper deviation (+mm)
    lower_tol: float    # Lower deviation (-mm)

class PrecisionVerificationHarness:
    """Tessellation-error helper. Name kept for backward compatibility with blender_twin_controller.py."""

    def __init__(self, target_tolerance_mm: float = 0.005):
        self.target_tol = target_tolerance_mm  # mesh chordal-error target, not a machining tolerance
        self.test_results: List[Dict[str, Any]] = []

    def verify_dimension(self, feature_name: str, measured: float, spec: ToleranceSpec, eps: float = 1e-6) -> Dict[str, Any]:
        """Checks a value against a nominal band. `measured` is whatever the caller passes in."""
        passed = (measured >= spec.nominal + spec.lower_tol - eps) and \
                 (measured <= spec.nominal + spec.upper_tol + eps)
        deviation_um = (measured - spec.nominal) * 1000.0

        result = {
            "feature": feature_name,
            "nominal": spec.nominal,
            "measured": measured,
            "deviation_um": round(deviation_um, 3),
            "passed": passed
        }
        self.test_results.append(result)
        return result

    @staticmethod
    def calculate_chordal_deviation(radius_mm: float, segments: int) -> float:
        """Maximum chordal error (facet deviation) for a meshed circle.
        Formula: delta = R * (1 - cos(theta / 2)), theta = 2*pi / segments
        """
        if segments < 3:
            return radius_mm
        angle = (2.0 * math.pi) / segments
        return radius_mm * (1.0 - math.cos(angle / 2.0))

    @staticmethod
    def required_segments_for_tolerance(radius_mm: float, max_error_mm: float = 0.002) -> int:
        """Minimum mesh segments so that chordal error <= max_error_mm."""
        if max_error_mm >= radius_mm:
            return 3
        cos_half_theta = 1.0 - (max_error_mm / radius_mm)
        half_theta = math.acos(max(min(cos_half_theta, 1.0), -1.0))
        theta = half_theta * 2.0
        segments = math.ceil((2.0 * math.pi) / theta)
        return int(segments)

    def print_summary(self):
        print("\n=======================================================")
        print(" [Tessellation / mesh self-consistency report]")
        print(" NOT a machining tolerance check (see module docstring)")
        print("=======================================================")
        all_in_band = True
        for r in self.test_results:
            status = "IN BAND" if r["passed"] else "OUT OF BAND"
            if not r["passed"]:
                all_in_band = False
            print(f"[{status}] {r['feature']:<25}: Value={r['measured']:.4f}mm | Dev={r['deviation_um']:+.2f} um")
        print("-------------------------------------------------------")
        print(f"All values within the given bands: {all_in_band}")
        print("=======================================================\n")
        return all_in_band

if __name__ == "__main__":
    harness = PrecisionVerificationHarness(target_tolerance_mm=0.005)

    # EXAMPLE INPUT VALUES ONLY - these numbers are typed in here, nothing is measured.
    spec_bore = ToleranceSpec(nominal=20.0, upper_tol=0.021, lower_tol=0.0)
    harness.verify_dimension("Example bore (typed-in value)", measured=20.008, spec=spec_bore)

    spec_flange = ToleranceSpec(nominal=12.0, upper_tol=0.008, lower_tol=-0.008)
    harness.verify_dimension("Example flange (typed-in value)", measured=12.003, spec=spec_flange)

    # Real calculation: mesh resolution needed for a given chordal error
    seg_needed = harness.required_segments_for_tolerance(radius_mm=25.0, max_error_mm=0.001)
    print(f"[Tessellation] Segments needed for R=25mm to keep chordal error < 1 um: {seg_needed}")

    harness.print_summary()
