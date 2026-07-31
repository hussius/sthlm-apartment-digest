/**
 * "Innanför tullarna" — central Stockholm inside the old customs boundary.
 *
 * Polygon vertices as [lat, lng], clockwise. Deliberately drawn to include core
 * Södermalm (incl. Långholmen), Kungsholmen, Norrmalm/City, Vasastan, Östermalm,
 * Gamla Stan and western Djurgården — while EXCLUDING across-the-water areas
 * that are geographically near but not central: Liljeholmen, Gröndal, Årsta,
 * Hammarby Sjöstad, Gärdet's far NE, and everything further out.
 *
 * Easy to tweak: adjust a vertex and re-run the polygon tests.
 */
export const TULLARNA_POLYGON: ReadonlyArray<readonly [number, number]> = [
  [59.345, 18.0], // NW Kungsholmen north (Karlberg)
  [59.348, 18.042], // Norrtull
  [59.349, 18.065], // Roslagstull
  [59.345, 18.098], // NE Östermalm / Gärdet edge
  [59.335, 18.118], // E Djurgården (Djurgårdsbrunn)
  [59.32, 18.108], // SE Djurgården (Beckholmen)
  [59.309, 18.093], // Danvikstull / Södermalm SE
  [59.305, 18.078], // Skanstull
  [59.31, 18.045], // Zinkensdamm south shore
  [59.314, 18.028], // Hornstull
  [59.32, 18.016], // Långholmen west
  [59.325, 17.995], // Kungsholmen SW (Marieberg)
  [59.332, 17.982], // Kungsholmen W (Fredhäll)
];

/**
 * Ray-casting point-in-polygon. Returns true if (lat,lng) is inside.
 * Coordinates treated as planar (fine at city scale).
 */
export function pointInPolygon(
  lat: number,
  lng: number,
  polygon: ReadonlyArray<readonly [number, number]> = TULLARNA_POLYGON,
): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [latI, lngI] = polygon[i];
    const [latJ, lngJ] = polygon[j];
    const intersects =
      lngI > lng !== lngJ > lng &&
      lat < ((latJ - latI) * (lng - lngI)) / (lngJ - lngI) + latI;
    if (intersects) inside = !inside;
  }
  return inside;
}

/** Convenience wrapper for possibly-null coordinates. */
export function isCentral(lat: number | null, lng: number | null): boolean {
  if (lat == null || lng == null) return false;
  return pointInPolygon(lat, lng);
}
