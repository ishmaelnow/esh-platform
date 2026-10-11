export type DailyActivity = {
  driverProfileId: string; timeZone: string; localDate: string;
  startsAt: string; endsAt: string; asOf: string;
  completedTrips: number; distanceMeters: number | null;
  missingDistanceTrips: number; onlineSeconds: number | null;
};

export function activityLabels(activity: DailyActivity | null) {
  return {
    distance: activity?.distanceMeters == null ? "Unavailable" : `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(activity.distanceMeters / 1000)} km`,
    online: activity?.onlineSeconds == null ? "Unavailable"
      : `${Math.floor(activity.onlineSeconds / 3600)}h ${Math.floor((activity.onlineSeconds % 3600) / 60)}m`,
  };
}
