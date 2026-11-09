package dev.ukitomato.closta.platforms.intellij.composer

import com.intellij.codeInsight.completion.CompletionParameters
import com.intellij.codeInsight.completion.CompletionResultSet
import com.intellij.codeInsight.completion.InsertHandler
import com.intellij.codeInsight.completion.PlainPrefixMatcher
import com.intellij.codeInsight.lookup.CharFilter
import com.intellij.codeInsight.lookup.LookupElement
import com.intellij.codeInsight.lookup.LookupElementBuilder
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.project.Project
import com.intellij.openapi.project.guessProjectDir
import com.intellij.openapi.vfs.VfsUtilCore
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.psi.codeStyle.NameUtil
import com.intellij.psi.search.FilenameIndex
import com.intellij.psi.search.GlobalSearchScope
import com.intellij.util.textCompletion.TextCompletionProvider
import dev.ukitomato.closta.presenter.view.SlashCommandRecord

/**
 * What the composer completes: after `@`, the project's files ranked as Go to File ranks them (the IDE's name matcher,
 * open files first); after a `/` at the start of the text, the CLI's commands, those that start with what was typed
 * first. Nothing is completed anywhere else (a null prefix keeps the list closed).
 */
class ComposerCompletion(
    private val project: Project,
    private val commands: () -> List<SlashCommandRecord>,
) : TextCompletionProvider {
    override fun getAdvertisement(): String? = null

    override fun getPrefix(
        text: String,
        offset: Int,
    ): String? {
        val start = text.lastIndexOfAny(charArrayOf(' ', '\n', '\t'), offset - 1) + 1
        if (start >= offset) return null
        val token = text.substring(start, offset)
        return when {
            token.startsWith('@') -> token.substring(1)
            token.startsWith('/') && text.substring(0, start).isBlank() -> token.substring(1)
            else -> null
        }
    }

    override fun applyPrefixMatcher(
        result: CompletionResultSet,
        prefix: String,
    ): CompletionResultSet = result.withPrefixMatcher(PlainPrefixMatcher(prefix))

    override fun acceptChar(c: Char): CharFilter.Result =
        if (c.isWhitespace()) CharFilter.Result.HIDE_LOOKUP else CharFilter.Result.ADD_TO_PREFIX

    override fun fillCompletionVariants(
        parameters: CompletionParameters,
        prefix: String,
        result: CompletionResultSet,
    ) {
        val text = parameters.editor.document.charsSequence
        val triggerAt = parameters.offset - prefix.length - 1
        if (triggerAt < 0) return
        when (text[triggerAt]) {
            '@' ->
                files(prefix).forEachIndexed {
                    rank,
                    (path, file),
                    ->
                    result.addElement(fileElement(path, file, rank))
                }
            '/' -> commandsFor(prefix).forEach { result.addElement(commandElement(it)) }
        }
        result.stopHere()
    }

    private fun commandsFor(prefix: String): List<SlashCommandRecord> {
        val all = commands()
        val starts = all.filter { it.name.startsWith(prefix, ignoreCase = true) }
        return starts + all.filter { it !in starts && it.name.contains(prefix, ignoreCase = true) }
    }

    private fun commandElement(command: SlashCommandRecord): LookupElement =
        LookupElementBuilder
            .create(command.name)
            .withPresentableText("/${command.name}")
            .withTailText(command.argumentHint?.let { " $it" }, true)
            .withTypeText(command.description, true)
            .withInsertHandler(SPACE)

    private fun fileElement(
        path: String,
        file: VirtualFile,
        rank: Int,
    ): LookupElement =
        com.intellij.codeInsight.completion.PrioritizedLookupElement.withPriority(
            LookupElementBuilder
                .create(path)
                .withPresentableText(file.name)
                .withTailText("  ${path.substringBeforeLast('/', "")}", true)
                .withIcon(file.fileType.icon)
                .withInsertHandler(SPACE),
            (FILE_LIMIT - rank).toDouble(),
        )

    /** The files whose names match [prefix], best match first, the files open in the editor before the others. */
    private fun files(prefix: String): List<Pair<String, VirtualFile>> {
        val root = project.guessProjectDir() ?: return emptyList()
        val scope = GlobalSearchScope.projectScope(project)
        val matcher = NameUtil.buildMatcher("*$prefix").build()
        val names = ArrayList<String>()
        FilenameIndex.processAllFileNames({ name ->
            if (matcher.matches(name)) names += name
            true
        }, scope, null)
        val open = FileEditorManager.getInstance(project).openFiles.toSet()
        return names
            .sortedByDescending { matcher.matchingDegree(it) }
            .asSequence()
            .flatMap { FilenameIndex.getVirtualFilesByName(it, scope).asSequence() }
            .take(FILE_LIMIT * 2)
            .mapNotNull { file -> VfsUtilCore.getRelativePath(file, root)?.let { it to file } }
            .sortedBy { (_, file) -> if (file in open) 0 else 1 }
            .take(FILE_LIMIT)
            .toList()
    }

    private companion object {
        const val FILE_LIMIT = 50

        val SPACE =
            InsertHandler<LookupElement> { context, _ ->
                val document = context.document
                val at = context.tailOffset
                if (at >= document.textLength || document.charsSequence[at] != ' ') document.insertString(at, " ")
                context.editor.caretModel.moveToOffset(at + 1)
            }
    }
}
