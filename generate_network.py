import osmnx as ox
import json

print("Downloading Purdue walking network...")

# Center of Purdue University campus
latitude = 40.4237
longitude = -86.9212

# Download pedestrian network within 1500 meters
G = ox.graph_from_point(
    (latitude, longitude),
    dist=1500,
    network_type="walk",
    simplify=True
)

print("Network downloaded!")
print("Nodes:", len(G.nodes))
print("Edges:", len(G.edges))

# Convert network edges to GeoJSON
edges = ox.graph_to_gdfs(G, nodes=False, fill_edge_geometry=True)
edges = edges.to_crs(epsg=4326)

geojson = json.loads(edges.to_json())

with open("walking-network.geojson", "w", encoding="utf-8") as f:
    json.dump(geojson, f)

print("SUCCESS! Saved walking-network.geojson")
