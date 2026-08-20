package com.esh.driver

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Bundle
import android.util.Log
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.app.ActivityCompat
import com.mapbox.api.directions.v5.models.RouteOptions
import com.mapbox.bindgen.Expected
import com.mapbox.common.location.Location
import com.mapbox.geojson.Point
import com.mapbox.maps.CameraOptions
import com.mapbox.maps.MapInitOptions
import com.mapbox.maps.MapView
import com.mapbox.maps.plugin.animation.camera
import com.mapbox.maps.plugin.locationcomponent.createDefault2DPuck
import com.mapbox.maps.plugin.locationcomponent.location
import com.mapbox.navigation.base.extensions.applyDefaultNavigationOptions
import com.mapbox.navigation.base.extensions.applyLanguageAndVoiceUnitOptions
import com.mapbox.navigation.base.options.NavigationOptions
import com.mapbox.navigation.base.route.NavigationRoute
import com.mapbox.navigation.base.route.NavigationRouterCallback
import com.mapbox.navigation.base.route.RouterFailure
import com.mapbox.navigation.core.MapboxNavigation
import com.mapbox.navigation.core.MapboxNavigationProvider
import com.mapbox.navigation.core.directions.session.RoutesObserver
import com.mapbox.navigation.core.trip.session.LocationMatcherResult
import com.mapbox.navigation.core.trip.session.LocationObserver
import com.mapbox.navigation.core.trip.session.RouteProgressObserver
import com.mapbox.navigation.core.trip.session.VoiceInstructionsObserver
import com.mapbox.navigation.base.formatter.DistanceFormatterOptions
import com.mapbox.navigation.core.formatter.MapboxDistanceFormatter
import com.mapbox.navigation.tripdata.maneuver.api.MapboxManeuverApi
import com.mapbox.navigation.tripdata.tripprogress.api.MapboxTripProgressApi
import com.mapbox.navigation.tripdata.tripprogress.formatter.EstimatedTimeToArrivalFormatter
import com.mapbox.navigation.tripdata.tripprogress.formatter.TimeRemainingFormatter
import com.mapbox.navigation.tripdata.tripprogress.formatter.TripProgressUpdateFormatter
import com.mapbox.navigation.ui.components.maneuver.view.MapboxManeuverView
import com.mapbox.navigation.ui.components.tripprogress.view.MapboxTripProgressView
import com.mapbox.navigation.ui.maps.camera.NavigationCamera
import com.mapbox.navigation.ui.maps.camera.data.MapboxNavigationViewportDataSource
import com.mapbox.navigation.ui.base.util.MapboxNavigationConsumer
import com.mapbox.navigation.ui.maps.location.NavigationLocationProvider
import com.mapbox.navigation.ui.maps.route.line.api.MapboxRouteLineApi
import com.mapbox.navigation.ui.maps.route.line.api.MapboxRouteLineView
import com.mapbox.navigation.ui.maps.route.line.model.MapboxRouteLineApiOptions
import com.mapbox.navigation.ui.maps.route.line.model.MapboxRouteLineViewOptions
import com.mapbox.navigation.voice.api.MapboxSpeechApi
import com.mapbox.navigation.voice.api.MapboxVoiceInstructionsPlayer
import com.mapbox.navigation.voice.model.SpeechAnnouncement
import com.mapbox.navigation.voice.model.SpeechError
import com.mapbox.navigation.voice.model.SpeechValue
import java.util.Locale

class EmbeddedNavigationActivity : ComponentActivity() {
    private lateinit var mapView: MapView
    private lateinit var maneuverView: MapboxManeuverView
    private lateinit var tripProgressView: MapboxTripProgressView
    private lateinit var navigationLocationProvider: NavigationLocationProvider
    private lateinit var routeLineApi: MapboxRouteLineApi
    private lateinit var routeLineView: MapboxRouteLineView
    private var mapboxNavigation: MapboxNavigation? = null
    private var destination: Point? = null
    private var accessToken: String = ""
    private var currentLocation: Location? = null
    private var routeRequested = false
    private lateinit var viewportDataSource: MapboxNavigationViewportDataSource
    private lateinit var navigationCamera: NavigationCamera
    private lateinit var speechApi: MapboxSpeechApi
    private lateinit var voiceInstructionsPlayer: MapboxVoiceInstructionsPlayer

    private val maneuverApi by lazy {
        MapboxManeuverApi(MapboxDistanceFormatter(DistanceFormatterOptions.Builder(this).build()))
    }

    private val tripProgressApi by lazy {
        val formatter = TripProgressUpdateFormatter.Builder(this)
            .distanceRemainingFormatter(com.mapbox.navigation.tripdata.tripprogress.formatter.DistanceRemainingFormatter(DistanceFormatterOptions.Builder(this).build()))
            .timeRemainingFormatter(TimeRemainingFormatter(this))
            .estimatedTimeToArrivalFormatter(EstimatedTimeToArrivalFormatter(this))
            .build()
        MapboxTripProgressApi(formatter)
    }

    private val voiceInstructionsObserver = VoiceInstructionsObserver { instructions ->
        speechApi.generate(instructions, speechCallback)
    }

    private val routeProgressObserver = RouteProgressObserver { progress ->
        viewportDataSource.onRouteProgressChanged(progress)
        viewportDataSource.evaluate()
        val maneuvers = maneuverApi.getManeuvers(progress)
        val tripProgress = tripProgressApi.getTripProgress(progress)
        runOnUiThread {
            if (::maneuverView.isInitialized) {
                maneuverView.renderManeuvers(maneuvers)
                (maneuverView as View).visibility = View.VISIBLE
                tripProgressView.render(tripProgress)
                (tripProgressView as View).visibility = View.VISIBLE
            }
        }
    }

    private val speechCallback = MapboxNavigationConsumer<Expected<SpeechError, SpeechValue>> { expected ->
        expected.fold(
            { error -> voiceInstructionsPlayer.play(error.fallback, voiceInstructionsPlayerCallback) },
            { value -> voiceInstructionsPlayer.play(value.announcement, voiceInstructionsPlayerCallback) },
        )
    }

    private val voiceInstructionsPlayerCallback = MapboxNavigationConsumer<SpeechAnnouncement> { announcement ->
        speechApi.clean(announcement)
    }

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
            val destinationPoint = destination ?: run {
                Toast.makeText(this, "Trip destination is unavailable", Toast.LENGTH_LONG).show()
                finish()
                return
            }
            if (getString(R.string.mapbox_access_token).isBlank()) {
                Toast.makeText(this, "Mapbox public token is not configured", Toast.LENGTH_LONG).show()
                finish()
                return
            }
            speechApi = MapboxSpeechApi(this, Locale.US.toLanguageTag())
            voiceInstructionsPlayer = MapboxVoiceInstructionsPlayer(this, Locale.US.toLanguageTag())
            mapView = MapView(
                this,
                MapInitOptions(
                    this,
                    cameraOptions = CameraOptions.Builder()
                        .center(destinationPoint)
                        .zoom(12.0)
                        .build(),
                ),
            )
            navigationLocationProvider = NavigationLocationProvider()
            mapView.location.setLocationProvider(navigationLocationProvider)
            mapView.location.locationPuck = createDefault2DPuck()
            mapView.location.enabled = true
            maneuverView = MapboxManeuverView(this)
            tripProgressView = MapboxTripProgressView(this)
            (maneuverView as View).visibility = View.GONE
            (tripProgressView as View).visibility = View.GONE
            val navigationLayout = FrameLayout(this).apply {
                addView(mapView, ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
                addView(
                    maneuverView as View,
                    FrameLayout.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT,
                        ViewGroup.LayoutParams.WRAP_CONTENT,
                    ).apply {
                        gravity = android.view.Gravity.TOP
                        setMargins(dp(16), dp(24), dp(16), 0)
                    },
                )
                addView(
                    tripProgressView as View,
                    FrameLayout.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT,
                        ViewGroup.LayoutParams.WRAP_CONTENT,
                    ).apply {
                        gravity = android.view.Gravity.BOTTOM
                        setMargins(dp(16), 0, dp(16), dp(24))
                    },
                )
            }
            setContentView(navigationLayout)
            mapView.mapboxMap.loadStyleUri("mapbox://styles/mapbox/streets-v12")
            routeLineApi = MapboxRouteLineApi(MapboxRouteLineApiOptions.Builder().build())
            routeLineView = MapboxRouteLineView(MapboxRouteLineViewOptions.Builder(this).build())
            viewportDataSource = MapboxNavigationViewportDataSource(mapView.mapboxMap).apply {
                followingPadding = com.mapbox.maps.EdgeInsets(dp(180).toDouble(), dp(40).toDouble(), dp(150).toDouble(), dp(40).toDouble())
                overviewPadding = com.mapbox.maps.EdgeInsets(dp(140).toDouble(), dp(40).toDouble(), dp(120).toDouble(), dp(40).toDouble())
            }
            navigationCamera = NavigationCamera(mapView.mapboxMap, mapView.camera, viewportDataSource)

            val navigationOptions = NavigationOptions.Builder(this).build()
            mapboxNavigation = if (MapboxNavigationProvider.isCreated()) {
                MapboxNavigationProvider.retrieve()
            } else {
                MapboxNavigationProvider.create(navigationOptions)
            }
            mapboxNavigation?.registerRoutesObserver(routesObserver)
            mapboxNavigation?.registerLocationObserver(locationObserver)
            mapboxNavigation?.registerRouteProgressObserver(routeProgressObserver)
            mapboxNavigation?.registerVoiceInstructionsObserver(voiceInstructionsObserver)
            mapboxNavigation?.startTripSession()
        } catch (error: Exception) {
            Toast.makeText(this, "Navigation could not start: ${error.message ?: "unknown error"}", Toast.LENGTH_LONG).show()
            finish()
        }
    }

    private val routesObserver = RoutesObserver { update ->
        if (update.navigationRoutes.isNotEmpty()) {
            viewportDataSource.onRouteChanged(update.navigationRoutes.first())
            viewportDataSource.evaluate()
            routeLineApi.setNavigationRoutes(update.navigationRoutes) { drawData ->
                mapView.mapboxMap.getStyle { style -> routeLineView.renderRouteDrawData(style, drawData) }
            }
            mapboxNavigation?.setNavigationRoutes(update.navigationRoutes)
            navigationCamera.requestNavigationCameraToFollowing()
        } else if (::viewportDataSource.isInitialized) {
            viewportDataSource.clearRouteData()
            viewportDataSource.evaluate()
        }
    }

    private val locationObserver = object : LocationObserver {
        override fun onNewRawLocation(rawLocation: Location) = Unit
        override fun onNewLocationMatcherResult(result: LocationMatcherResult) {
            currentLocation = result.enhancedLocation
            navigationLocationProvider.changePosition(result.enhancedLocation, result.keyPoints)
            if (::viewportDataSource.isInitialized) {
                viewportDataSource.onLocationChanged(result.enhancedLocation)
                viewportDataSource.evaluate()
            }
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
                .applyLanguageAndVoiceUnitOptions(this)
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

    private fun dp(value: Int): Int = (value * resources.displayMetrics.density).toInt()

    override fun onDestroy() {
        if (::navigationCamera.isInitialized) navigationCamera.requestNavigationCameraToIdle()
        mapboxNavigation?.unregisterRoutesObserver(routesObserver)
        mapboxNavigation?.unregisterLocationObserver(locationObserver)
        mapboxNavigation?.unregisterRouteProgressObserver(routeProgressObserver)
        mapboxNavigation?.unregisterVoiceInstructionsObserver(voiceInstructionsObserver)
        mapboxNavigation?.stopTripSession()
        maneuverApi.cancel()
        if (::speechApi.isInitialized) speechApi.cancel()
        if (::voiceInstructionsPlayer.isInitialized) voiceInstructionsPlayer.shutdown()
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
