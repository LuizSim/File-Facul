import { supabase } from './supabaseClient';
import type { AuthSession } from '@supabase/supabase-js';


export async function handleCreateFolder(
    folderName: string,
    currentSession: AuthSession | null,
    parentFolderId: string | null = null
): Promise<{ success: boolean; error?: string }> {

    if (!folderName.trim()) {
        return { success: false, error: 'O nome da pasta não pode estar vazio.' };
    }
    if (!currentSession?.user) {
        return { success: false, error: 'Você precisa estar logado para criar uma pasta.' };
    }

    try {
        const { error } = await supabase
            .from('folders')
            .insert({
                name: folderName.trim(),
                owner_id: currentSession.user.id,
                parent_folder_id: parentFolderId
            })
            .select()
            .single();

        if (error) {
            console.error('Erro ao criar pasta:', error);
            if (error.message.includes('duplicate key value violates unique constraint')) {
                return { success: false, error: 'Já existe uma pasta com este nome neste local.' };
            }
            return { success: false, error: error.message };
        }

        console.log('Pasta criada com sucesso no Supabase.');
        return { success: true };

    } catch (error: any) {
        console.error('Exceção ao criar pasta:', error);
        return { success: false, error: error.message || 'Ocorreu um erro inesperado.' };
    }
}


export async function deleteFolderAndContents(folderId: string): Promise<{ success: boolean; error?: string }> {
    try {
        const { data: filesInFolder, error: filesError } = await supabase
            .from('files').select('id, storage_path').eq('folder_id', folderId);
        if (filesError) throw filesError;

        if (filesInFolder && filesInFolder.length > 0) {
            const storagePathsToDelete = filesInFolder.map(f => f.storage_path);
            const { error: storageError } = await supabase.storage.from('files').remove(storagePathsToDelete);
            if (storageError && storageError.message !== 'The resource was not found') {
                console.error(`Erro ao deletar arquivos do storage para pasta ${folderId}:`, storageError);
            }
            const fileIdsToDelete = filesInFolder.map(f => f.id);
            const { error: dbFilesError } = await supabase.from('files').delete().in('id', fileIdsToDelete);
            if (dbFilesError) throw dbFilesError;
        }

        const { data: subfolders, error: subfoldersError } = await supabase
            .from('folders').select('id').eq('parent_folder_id', folderId);
        if (subfoldersError) throw subfoldersError;

        if (subfolders && subfolders.length > 0) {
            for (const subfolder of subfolders) {
                const result = await deleteFolderAndContents(subfolder.id);
                if (!result.success) throw new Error(`Falha ao deletar subpasta ${subfolder.id}: ${result.error}`);
            }
        }

        const { error: deleteFolderError } = await supabase.from('folders').delete().eq('id', folderId);
        if (deleteFolderError) throw deleteFolderError;

        console.log(`Pasta ${folderId} e seu conteúdo foram deletados com sucesso.`);
        return { success: true };
    } catch (error: any) {
        console.error(`Erro geral ao deletar pasta ${folderId} e seu conteúdo:`, error);
        return { success: false, error: error.message || "Erro desconhecido na deleção recursiva." };
    }
}



export async function renameFolder(folderId: string, newName: string): Promise<{ success: boolean, error?: string }> {
    if (!newName.trim()) {
        return { success: false, error: "O nome da pasta não pode estar vazio." };
    }
    try {
        const { error } = await supabase
            .from('folders')
            .update({ name: newName.trim() })
            .eq('id', folderId);

        if (error) {
            console.error("Erro ao renomear pasta:", error);
            if (error.message.includes('duplicate key value violates unique constraint')) {
                return { success: false, error: 'Já existe uma pasta com este nome neste local.' };
            }
            return { success: false, error: error.message };
        }
        return { success: true };
    } catch (error: any) {
        console.error("Exceção ao renomear pasta:", error);
        return { success: false, error: error.message || "Ocorreu um erro inesperado." };
    }
}