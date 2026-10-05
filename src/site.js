import "./site.less";

// On load
window.addEventListener("load", () => {
  // Get Site <header>
  const header = document.getElementById("header");

  // Add Map Container
  const container = document.createElement("div");
  container.id = "waymark-map";
  header.appendChild(container);

  // Create viewer Instance
  const viewer = window.Waymark_Map_Factory.viewer();

  // Initialise with our options
  viewer.init({
    map_options: {
      tile_layers: [
        {
          layer_name: "OpenStreetMap",
          layer_url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png?r=1",
          layer_attribution:
            '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
          layer_max_zoom: "17",
        },
      ],
      map_height: 160,

      // Initial Map Zoom
      map_init_zoom: 8,

      // Initial Map Centre (Random country)
      map_init_latlng: viewer.country_code_to_bounds().getCenter(),
    },
  });
});
