
const BoilGPS = (() => {
  let marker = null;
  let accuracyCircle = null;
  let lastPosition = null;
  let watchId = null;

  function updatePosition(position) {
    const { latitude, longitude, accuracy } = position.coords;
    const point = [latitude, longitude];

    lastPosition = {
      lat: latitude,
      lng: longitude,
      accuracy
    };

    if (!marker) {
      marker = L.circleMarker(point, {
        radius: 9,
        color: "#ffffff",
        weight: 3,
        fillColor: "#247bdb",
        fillOpacity: 1
      }).addTo(map);

      marker.bindPopup("Your approximate GPS location");

      accuracyCircle = L.circle(point, {
        radius: accuracy,
        color: "#247bdb",
        weight: 1,
        fillColor: "#247bdb",
        fillOpacity: 0.12
      }).addTo(map);
    } else {
      marker.setLatLng(point);
      accuracyCircle.setLatLng(point);
      accuracyCircle.setRadius(accuracy);
    }
  }

  function getPosition() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error("GPS is not supported by this browser."));
        return;
      }

      navigator.geolocation.getCurrentPosition(
        position => {
          updatePosition(position);
          resolve([
            position.coords.longitude,
            position.coords.latitude
          ]);
        },
        error => {
          const messages = {
            1: "Location permission denied. Enable it in Safari settings.",
            2: "Location unavailable. Try moving outdoors.",
            3: "GPS request timed out. Try again."
          };

          reject(new Error(
            messages[error.code] || "Unable to get your location."
          ));
        },
        {
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 5000
        }
      );
    });
  }

  function startTracking() {
    if (!navigator.geolocation || watchId !== null) return;

    watchId = navigator.geolocation.watchPosition(
      updatePosition,
      error => console.warn("GPS tracking:", error.message),
      {
        enableHighAccuracy: true,
        maximumAge: 3000,
        timeout: 15000
      }
    );
  }

  function stopTracking() {
    if (watchId !== null) {
      navigator.geolocation.clearWatch(watchId);
      watchId = null;
    }
  }

  return {
    getPosition,
    startTracking,
    stopTracking,
    getLastPosition: () => lastPosition
  };
})();

window.BoilGPS = BoilGPS;
