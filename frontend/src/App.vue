<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'

const mapContainer = ref<HTMLDivElement>()
let map: maplibregl.Map

onMounted(() => {
  map = new maplibregl.Map({
    container: mapContainer.value!,
    // Blank style until PostGIS data is loaded
    style: {
      version: 8,
      sources: {},
      layers: [
        {
          id: 'background',
          type: 'background',
          paint: { 'background-color': '#1a1a2e' }
        }
      ]
    },
    center: [-111.093, 39.32], // Utah centroid
    zoom: 7
  })

  map.addControl(new maplibregl.NavigationControl(), 'top-right')
  map.addControl(
    new maplibregl.GeolocateControl({
      positionOptions: { enableHighAccuracy: true },
      trackUserLocation: true,
      showUserHeading: true
    }),
    'top-right'
  )
})

onUnmounted(() => map?.remove())
</script>

<template>
  <div class="relative w-full h-screen">
    <div ref="mapContainer" class="w-full h-full" />
    <div class="absolute top-3 left-3 bg-gray-900/80 text-white text-xs px-3 py-2 rounded">
      unfencd — no data loaded yet
    </div>
  </div>
</template>
