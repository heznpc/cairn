import type { MapLayout } from "../../src/types.js";

export const baseRenderLayout: MapLayout = {
  center: { lat: 37.5, lon: 127.0, label: "여기" },
  landmarks: [
    {
      id: "1",
      name: "역삼역",
      lat: 37.5005,
      lon: 127.0005,
      category: "station",
      importance: 1.0,
      tags: {},
    },
    {
      id: "2",
      name: "스타벅스",
      lat: 37.4998,
      lon: 127.0008,
      category: "cafe",
      importance: 0.5,
      tags: {},
    },
  ],
  roads: [],
  bbox: {
    north: 37.5013,
    south: 37.4988,
    east: 127.0018,
    west: 126.999,
  },
};
