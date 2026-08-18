package com.esh.driver

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Bundle
import android.util.Log
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.app.ActivityCompat
import com.mapbox.api.directions.v5.models.RouteOptions
import com.mapbox.common.location.Location
import com.mapbox.geojson.Point
import com.mapbox.maps.CameraOptions
import com.mapbox.maps.MapInitOptions
import com.mapbox.maps.MapView
import com.mapbox.maps.plugin.locationcomponent.createDefault2DPuck
import com.mapbox.maps.plugin.locationcomponent.location
import com.mapbox.navigation.base.extensions.applyDefaultNavigationOptions
import com.mapbox.navigation.base.options.NavigationOptions
import com.mapbox.navigation.base.route.NavigationRoute
import com.mapbox.navigation.base.route.NavigationRouterCallback
import com.mapbox.navigation.base.route.RouterFailure
import com.mapbox.navigation.core.MapboxNavigation
import com.mapbox.navigation.core.MapboxNavigationProvider
import com.mapbox.navigation.core.directions.session.RoutesObserver
import com.mapbox.navigation.core.trip.session.LocationMatcherResult
import com.mapbox.navigation.core.trip.session.LocationObserver
import com.mapbox.navigation.ui.maps.location.NavigationLocationProvider
import com.mapbox.navigation.ui.maps.route.line.api.MapboxRouteLineApi
import com.mapbox.navigation.ui.maps.route.line.api.MapboxRouteLineView
import com.mapbox.navigation.ui.maps.route.line.model.MapboxRouteLineApiOptions
import com.mapbox.navigation.ui.maps.route.line.model.MapboxRouteLineViewOptions

class EmbeddedNavigationActivity : ComponentActivity() {
    private lateinit var mapView: MapView
    private lateinit var navigationLocationProvider: NavigationLocationProvider
    private lateinit var routeLineApi: MapboxRouteLineApi
    private lateinit var routeLineView: MapboxRouteLineView
    private var mapboxNavigation: MapboxNavigation? = null
    private var destination: Point? = null
    private var accessToken: String = ""
    private var currentLocation: Location? = null
    private var routeRequested = false

    private val permissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { permissions ->
        if (permissions[Manifest.permission.ACCESS_COARSE_LOCATION] == true ||
            permissions[Manifest.permission.ACCESS_FINE_LOCATION] == true) {
            startNavigation()
        } else {
            Toast.makeText(this, "Location permission is required for turn-by-turn navigation", Toast.LENGTH_LONG).show()
            finish()
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val token = intent.getStringExtra(EXTRA_TOKEN).orEmpty()
        accessToken = token
        destination = Point.fromLngLat(
            intent.getDoubleExtra(EXTRA_LONGITUDE, 0.0),
            intent.getDoubleExtra(EXTRA_LATITUDE, 0.0),
        )
        if (ActivityCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED ||
            ActivityCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED) {
            startNavigation()
        } else {
            permissionLauncher.launch(arrayOf(Manifest.permission.ACCESS_COARSE_LOCATION, Manifest.permission.ACCESS_FINE_LOCATION))
        }
    }

    private fun startNavigation() {
        try {
            if (getString(R.string.mapbox_access_token).isBlank()) {
                Toast.makeText(this, "Mapbox public token is not configured", Toast.LENGTH_LONG).show()
                finish()
                return
            }
            mapView = MapView(this, MapInitOptions(this, cameraOptions = CameraOptions.Builder().zoom(14.0).build()))
            navigationLocationProvider = NavigationLocationProvider()
            mapView.location.setLocationProvider(navigationLocationProvider)
            mapView.location.locationPuck = createDefault2DPuck()
            mapView.location.enabled = true
            setContentView(mapView)
            routeLineApi = MapboxRouteLineApi(MapboxRouteLineApiOptions.Builder().build())
            routeLineView = MapboxRouteLineView(MapboxRouteLineViewOptions.Builder(this).build())

            val navigationOptions = NavigationOptions.Builder(this).build()
            mapboxNavigation = if (MapboxNavigationProvider.isCreated()) {
                MapboxNavigationProvider.retrieve()
            } else {
                MapboxNavigationProvider.create(navigationOptions)
            }
            mapboxNavigation?.registerRoutesObserver(routesObserver)
            mapboxNavigation?.registerLocationObserver(locationObserver)
            mapboxNavigation?.startTripSession()
        } catch (error: Exception) {
            Toast.makeText(this, "Navigation could not start: ${error.message ?: "unknown error"}", Toast.LENGTH_LONG).show()
            finish()
        }
    }

    private val routesObserver = RoutesObserver { update ->
        if (update.navigationRoutes.isNotEmpty()) {
            routeLineApi.setNavigationRoutes(update.navigationRoutes) { drawData ->
                mapView.mapboxMap.getStyle { style -> routeLineView.renderRouteDrawData(style, drawData) }
            }
            mapboxNavigation?.setNavigationRoutes(update.navigationRoutes)
        }
    }

    private val locationObserver = object : LocationObserver {
        override fun onNewRawLocation(rawLocation: Location) = Unit
        override fun onNewLocationMatcherResult(result: LocationMatcherResult) {
            currentLocation = result.enhancedLocation
            navigationLocationProvider.changePosition(result.enhancedLocation, result.keyPoints)
            requestRouteIfReady()
        }
    }

    private fun requestRouteIfReady() {
        if (routeRequested) return
        val destinationPoint = destination ?: return
        val location = currentLocation ?: return
        routeRequested = true
        val origin = Point.fromLngLat(location.longitude, location.latitude)
        mapboxNavigation?.requestRoutes(
            RouteOptions.builder()
                .applyDefaultNavigationOptions()
                .coordinatesList(listOf(origin, destinationPoint))
                .build(),
            object : NavigationRouterCallback {
                override fun onCanceled(routeOptions: RouteOptions, routerOrigin: String) = Unit
                override fun onFailure(reasons: List<RouterFailure>, routeOptions: RouteOptions) {
                    routeRequested = false
                    Log.e(
                        LOG_TAG,
                        "Mapbox route failure origin=${currentLocation?.latitude},${currentLocation?.longitude} destination=${destinationPoint.latitude()},${destinationPoint.longitude()} reasons=$reasons options=$routeOptions",
                    )
                    runOnUiThread {
                        Toast.makeText(
                            this@EmbeddedNavigationActivity,
                            "Route failed: ${reasons.joinToString { "${it.type}: ${it.message}" }}",
                            Toast.LENGTH_LONG,
                        ).show()
                    }
                }
                override fun onRoutesReady(routes: List<NavigationRoute>, routerOrigin: String) {
                    mapboxNavigation?.setNavigationRoutes(routes)
                }
            },
        )
    }

    override fun onDestroy() {
        mapboxNavigation?.unregisterRoutesObserver(routesObserver)
        mapboxNavigation?.unregisterLocationObserver(locationObserver)
        mapboxNavigation?.stopTripSession()
        super.onDestroy()
    }

    companion object {
        private const val LOG_TAG = "EmbeddedNavigation"
        private const val EXTRA_LATITUDE = "latitude"
        private const val EXTRA_LONGITUDE = "longitude"
        private const val EXTRA_TOKEN = "accessToken"

        @JvmStatic
        fun intent(context: Context, latitude: Double, longitude: Double, label: String, accessToken: String) =
            Intent(context, EmbeddedNavigationActivity::class.java).apply {
                putExtra(EXTRA_LATITUDE, latitude)
                putExtra(EXTRA_LONGITUDE, longitude)
                putExtra(EXTRA_TOKEN, accessToken)
                putExtra("label", label)
            }
    }
}
