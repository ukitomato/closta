package dev.ukitomato.closta.platforms.intellij.session

import com.intellij.openapi.Disposable
import com.intellij.openapi.components.Service
import com.intellij.openapi.components.service
import com.intellij.openapi.project.Project
import com.intellij.openapi.roots.ModuleRootEvent
import com.intellij.openapi.roots.ModuleRootListener
import com.intellij.openapi.roots.ProjectRootManager
import dev.ukitomato.closta.platforms.intellij.ide.IdeBridgeService
import kotlinx.coroutines.flow.StateFlow

/**
 * The project's content roots for the sessions that were given them as working directories. The IDE is listened to only
 * from the first launch that was given any (with the setting off nothing listens), and what a change of the roots means
 * for each session is [RootsWatch]'s.
 */
@Service(Service.Level.PROJECT)
class ContentRoots(
    private val project: Project,
) : Disposable {
    private val ide get() = project.service<IdeBridgeService>()
    private val watch = RootsWatch { cwd -> extraRootsFor(cwd, project.basePath, roots(), ide.cliPaths).toSet() }
    private var listening = false

    /** The sessions that have a notice up. */
    val pending: StateFlow<Set<String>> get() = watch.pending

    /** The IDE's content roots, as the IDE writes their paths. */
    fun roots(): List<String> = ProjectRootManager.getInstance(project).contentRoots.map { it.presentableUrl }

    /** The planner that gives each launch the folders, and starts the listening once there is a session to watch. */
    fun planner(
        inner: SessionLaunchPlanner,
        enabled: () -> Boolean,
    ): SessionLaunchPlanner =
        ExtraRootsPlanner(inner, enabled, ::roots, project.basePath, ide.cliPaths) { id, cwd, given ->
            watch.launched(id, cwd, given)
            listen()
        }

    /** The session [id] is gone. */
    fun forget(id: String) = watch.forget(id)

    @Synchronized
    private fun listen() {
        if (listening) return
        listening = true
        project.messageBus.connect(this).subscribe(
            ModuleRootListener.TOPIC,
            object : ModuleRootListener {
                override fun rootsChanged(event: ModuleRootEvent) = watch.rootsChanged()
            },
        )
    }

    override fun dispose() = Unit
}
