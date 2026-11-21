/**
 * BloodConnect - Geospatial Proximity & Distance Utilities
 * Architecture: Geodesic great-circle distance calculation via Haversine & Spherical Trigonometry
 */

// Earth's mean volumetric radius in kilometers
const EARTH_RADIUS_KM = 6371.0088;

/**
 * Converts decimal degrees to radians
 * @param {number} degrees 
 * @returns {number} Radians
 */
const toRadians = (degrees) => {
  return degrees * (Math.PI / 180.0);
};

/**
 * Calculates geodesic distance between two coordinate pairs using the Haversine formula
 * @param {number} lat1 - Latitude of point 1
 * @param {number} lon1 - Longitude of point 1
 * @param {number} lat2 - Latitude of point 2
 * @param {number} lon2 - Longitude of point 2
 * @returns {number} Distance in kilometers rounded to two decimal places
 */
const calculateDistanceKm = (lat1, lon1, lat2, lon2) => {
  const p1 = parseFloat(lat1);
  const l1 = parseFloat(lon1);
  const p2 = parseFloat(lat2);
  const l2 = parseFloat(lon2);

  if (isNaN(p1) || isNaN(l1) || isNaN(p2) || isNaN(l2)) {
    return null;
  }

  // Exact same point check
  if (p1 === p2 && l1 === l2) {
    return 0.0;
  }

  const dLat = toRadians(p2 - p1);
  const dLon = toRadians(l2 - l1);

  const radLat1 = toRadians(p1);
  const radLat2 = toRadians(p2);

  // Haversine formula
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(radLat1) * Math.cos(radLat2) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = EARTH_RADIUS_KM * c;

  return Math.round(distance * 100) / 100;
};

/**
 * Returns raw SQL expression snippet for computing Haversine distance in MySQL queries.
 * Uses radians() and trigonometric functions supported in MySQL 5.7+ and 8.0+.
 * Parameter order required in query binding: [lat, lng, lat]
 * 
 * @returns {string} SQL distance expression in kilometers
 */
const HAVERSINE_SQL_FRAGMENT = `
  ROUND((
    6371 * ACOS(
      LEAST(1.0, GREATEST(-1.0,
        COS(RADIANS(?)) * COS(RADIANS(d.latitude)) * COS(RADIANS(d.longitude) - RADIANS(?)) +
        SIN(RADIANS(?)) * SIN(RADIANS(d.latitude))
      ))
    )
  ), 2)
`;

module.exports = {
  EARTH_RADIUS_KM,
  calculateDistanceKm,
  toRadians,
  HAVERSINE_SQL_FRAGMENT
};
