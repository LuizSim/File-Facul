import './style.css'
import { supabase } from './supabaseClient'
import type { AuthSession } from '@supabase/supabase-js'
import { handleCreateFolder, deleteFolderAndContents, renameFolder } from './folders';

// Interfaces para tipagem
interface Folder {
  id: string;
  created_at: string;
  name: string;
  owner_id: string;
  parent_folder_id: string | null;
  item_type: 'folder';
}

interface FileItemDB {
  id: string;
  created_at: string;
  file_name: string;
  file_type: string;
  storage_path: string;
  uploader_id: string;
  folder_id: string | null;
  item_type: 'file';
  profiles?: { full_name: string | null } | null;
}

function getIconForItem(item: Folder | FileItemDB): string {
  if (item.item_type === 'folder') {
    return `<svg xmlns="http://www.w3.org/2000/svg" fill="#facc15" viewBox="0 0 24 24" stroke-width="1.5" stroke="#eab308"><path stroke-linecap="round" stroke-linejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" /></svg>`;
  }
  const extension = item.file_name.split('.').pop()?.toLowerCase() || '';
  switch (extension) {
    case 'zip': case 'rar': case '7z':
      return `<svg xmlns="http://www.w3.org/2000/svg" fill="#a78bfa" viewBox="0 0 24 24" stroke-width="1.5" stroke="white"><path stroke-linecap="round" stroke-linejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" /></svg>`;
    case 'png': case 'jpg': case 'jpeg': case 'gif': case 'webp': case 'avif':
      return `<svg xmlns="http://www.w3.org/2000/svg" fill="#60a5fa" viewBox="0 0 24 24" stroke-width="1.5" stroke="white"><path stroke-linecap="round" stroke-linejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.174C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.174 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" /><path stroke-linecap="round" stroke-linejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z" /></svg>`;
    case 'dwg':
      return `<svg xmlns="http://www.w3.org/2000/svg" fill="#f472b6" viewBox="0 0 24 24" stroke-width="1.5" stroke="white"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9.75v6.75m0 0l-3-3m3 3l3-3m-8.25 6a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33 3 3 0 013.758 3.848A3.752 3.752 0 0118 19.5H6.75z" /></svg>`;
    case 'html': case 'css': case 'js': case 'ts': case 'tsx': case 'jsx': case 'json': case 'c': case 'cpp': case 'cs':
      return `<svg xmlns="http://www.w3.org/2000/svg" fill="#818cf8" viewBox="0 0 24 24" stroke-width="1.5" stroke="white"><path stroke-linecap="round" stroke-linejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" /></svg>`;
    default:
      return `<svg xmlns="http://www.w3.org/2000/svg" fill="#9ca3af" viewBox="0 0 24 24" stroke-width="1.5" stroke="white"><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m.75 12l3 3m0 0l3-3m-3 3v-6m-1.5-9H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>`;
  }
}

function sanitizeFileName(name: string): string {
  // Separa o nome da extensão
  const extension = name.split('.').pop() || '';
  const nameWithoutExtension = name.substring(0, name.lastIndexOf('.')) || name;

  const sanitized = nameWithoutExtension
    .normalize("NFD") // Separa acentos das letras (ex: 'á' -> 'a' + ´)
    .replace(/[\u0300-\u036f]/g, "") // Remove os acentos
    .replace(/[^a-zA-Z0-9_.-]/g, '_') // Substitui qualquer caractere não seguro por _
    .replace(/\s+/g, '_'); // Substitui espaços por _

  // Retorna o nome limpo + a extensão original
  return `${sanitized}.${extension}`;
}

document.addEventListener('DOMContentLoaded', () => {

  const appElement = document.querySelector<HTMLDivElement>('#app')!;
  const authView = document.querySelector<HTMLDivElement>('#auth-view')!;
  const loggedInView = document.querySelector<HTMLDivElement>('#logged-in-view')!;
  const loginContainer = document.querySelector<HTMLDivElement>('#login-container')!;
  const loginForm = document.querySelector<HTMLFormElement>('#login-form')!;
  const showSignupViewButton = document.querySelector<HTMLButtonElement>('#show-signup-view-button')!;
  const signupContainer = document.querySelector<HTMLDivElement>('#signup-container')!;
  const signupForm = document.querySelector<HTMLFormElement>('#signup-form')!;
  const showLoginViewButton = document.querySelector<HTMLButtonElement>('#show-login-view-button')!;
  const logoutButton = document.querySelector<HTMLButtonElement>('#logout-button')!;
  const userInfo = document.querySelector<HTMLParagraphElement>('#user-info')!;
  const uploadForm = document.querySelector<HTMLFormElement>('#upload-form')!;
  const fileInput = document.querySelector<HTMLInputElement>('#file-input')!;
  const fileList = document.querySelector<HTMLDivElement>('#file-list')!;
  const appMessageContainer = document.querySelector<HTMLDivElement>('#app-message-container')!;
  const appMessageText = document.querySelector<HTMLParagraphElement>('#app-message-text')!;
  const loadingOverlay = document.querySelector<HTMLDivElement>('#loading-overlay')!;
  const loadingOverlayText = loadingOverlay.querySelector('p');
  const confirmModalOverlay = document.querySelector<HTMLDivElement>('#confirm-modal-overlay')!;
  const confirmModalMessage = document.querySelector<HTMLParagraphElement>('#confirm-modal-message')!;
  const confirmModalYesButton = document.querySelector<HTMLButtonElement>('#confirm-modal-yes-button')!;
  const confirmModalNoButton = document.querySelector<HTMLButtonElement>('#confirm-modal-no-button')!;
  const createFolderForm = document.querySelector<HTMLFormElement>('#create-folder-form')!;
  const folderNameInput = document.querySelector<HTMLInputElement>('#folder-name-input')!;
  const folderNavigationControls = document.querySelector<HTMLDivElement>('#folder-navigation-controls')!;
  const fileInputLabel = document.querySelector<HTMLLabelElement>('#file-input-label')!;
  const fileInputText = document.querySelector<HTMLSpanElement>('#file-input-text')!;
  const iconAddFile = document.querySelector<SVGElement>('#icon-add-file')!;
  const iconFileSelected = document.querySelector<SVGElement>('#icon-file-selected')!;

  if (!appElement || !authView || !loggedInView || !loginForm || !signupForm || !logoutButton ||
    !uploadForm || !fileList || !appMessageContainer || !appMessageText || !loadingOverlay ||
    !confirmModalOverlay || !confirmModalMessage || !confirmModalYesButton || !confirmModalNoButton ||
    !createFolderForm || !folderNameInput || !loginContainer || !signupContainer || !folderNavigationControls ||
    !userInfo || !fileInput || !loadingOverlayText ||
    !fileInputLabel || !fileInputText || !iconAddFile || !iconFileSelected) {
    console.error("ERRO CRÍTICO: Um ou mais elementos essenciais da UI não foram encontrados.");
    return;
  }

  let session: AuthSession | null = null;
  let appMessageTimeoutId: number | null = null;
  let currentFolderId: string | null = null;
  let pressTimer: number | null = null;

  function showAppMessage(message: string, type: 'success' | 'error' | 'info' = 'info', duration: number = 3000) {
    if (appMessageTimeoutId) clearTimeout(appMessageTimeoutId);
    appMessageText.textContent = message;
    appMessageContainer.className = 'app-message-container';
    appMessageContainer.classList.add(type);
    appMessageContainer.style.display = 'block';
    appMessageTimeoutId = window.setTimeout(() => {
      appMessageContainer.style.display = 'none';
    }, duration);
  }

  function showLoading(text: string = "Processando, aguarde...") {
    if (loadingOverlayText) loadingOverlayText.textContent = text;
    loadingOverlay.classList.add('visible'); // MUDANÇA: Usa classe em vez de style
    appElement.classList.add('app-blurred');
  }

  function hideLoading() {
    loadingOverlay.classList.remove('visible'); // MUDANÇA: Usa classe em vez de style
    // A remoção do blur agora é tratada no listener do modal de confirmação,
    // para não remover o blur enquanto o outro modal estiver aberto.
    if (confirmModalOverlay.classList.contains('visible') === false) {
      appElement.classList.remove('app-blurred');
    }
  }

  function showCustomConfirm(message: string): Promise<boolean> {
    return new Promise((resolve) => {
      const overlay = document.getElementById('confirm-modal-overlay');
      const messageElem = document.getElementById('confirm-modal-message');
      const yesBtn = document.getElementById('confirm-modal-yes-button');
      const noBtn = document.getElementById('confirm-modal-no-button');

      // Verificação de existência dos elementos
      if (!overlay || !messageElem || !yesBtn || !noBtn) {
        console.error('Erro: Elementos do modal de confirmação não encontrados.');
        resolve(false);
        return;
      }

      messageElem.textContent = message;
      overlay.classList.add('visible');

      function cleanup(result: boolean) {
        overlay!.classList.remove('visible');
        yesBtn!.removeEventListener('click', onYes);
        noBtn!.removeEventListener('click', onNo);
        resolve(result);
      }
      function onYes() { cleanup(true); }
      function onNo() { cleanup(false); }

      yesBtn!.addEventListener('click', onYes);
      noBtn!.addEventListener('click', onNo);
    });
  }

  function resetFileInputLabel() {
    fileInputText.textContent = 'Escolher arquivo...';
    fileInputLabel.classList.remove('file-selected');
    iconAddFile.style.display = 'block';
    iconFileSelected.style.display = 'none';
    fileInput.value = '';
  }

  function updateView() {
    if (session) {
      authView.style.display = 'none';
      loggedInView.style.display = 'block';
      userInfo.textContent = `Logado como: ${session.user.user_metadata.username || session.user.email}`;
      displayItemsInCurrentFolder(currentFolderId);
    } else {
      authView.style.display = 'block';
      loggedInView.style.display = 'none';
      currentFolderId = null;
    }
  }

  async function displayItemsInCurrentFolder(folderIdToDisplay: string | null) {
    if (!session?.user) return;
    showLoading("Carregando itens...");
    currentFolderId = folderIdToDisplay;
    folderNavigationControls.innerHTML = '';

    if (currentFolderId !== null) {
      let currentPathDisplay = "Pasta Atual";
      const { data: currentFolderData, error: folderDataError } = await supabase
        .from('folders').select('name, parent_folder_id').eq('id', currentFolderId).single();
      if (folderDataError) { console.error("Erro ao buscar dados da pasta atual:", folderDataError); showAppMessage("Erro.", 'error'); }

      const backButton = document.createElement('button'); backButton.className = 'back-button';
      const parentIdOfCurrent = currentFolderData?.parent_folder_id;
      backButton.textContent = '⬅️ Voltar';
      backButton.onclick = () => { displayItemsInCurrentFolder(parentIdOfCurrent); };
      folderNavigationControls.appendChild(backButton);

      if (currentFolderData) { currentPathDisplay = `${currentFolderData.name}`; }
      else { currentPathDisplay = `Pasta Desconhecida`; }

      const pathSpan = document.createElement('span');
      pathSpan.textContent = `  Visualizando: ${currentPathDisplay}`;
      pathSpan.style.marginLeft = "10px";
      pathSpan.style.fontStyle = "italic";
      folderNavigationControls.appendChild(pathSpan);
    }

    try {
      // CORREÇÃO: Lógica de query sem 'eqOrIsNull'
      let foldersQuery = supabase.from('folders').select('*');
      if (folderIdToDisplay === null) {
        foldersQuery = foldersQuery.is('parent_folder_id', null);
      } else {
        foldersQuery = foldersQuery.eq('parent_folder_id', folderIdToDisplay);
      }
      const { data: foldersData, error: foldersError } = await foldersQuery.order('name', { ascending: true });
      if (foldersError) throw foldersError;

      let filesQuery = supabase.from('files').select('*');
      if (folderIdToDisplay === null) {
        filesQuery = filesQuery.is('folder_id', null);
      } else {
        filesQuery = filesQuery.eq('folder_id', folderIdToDisplay);
      }
      const { data: filesData, error: filesError } = await filesQuery.order('created_at', { ascending: false });
      if (filesError) throw filesError;

      // CORREÇÃO: Tipagem explícita para os parâmetros
      const fetchedFolders: Folder[] = foldersData?.map((f: any) => ({ ...f, item_type: 'folder' as const })) || [];
      const fetchedFiles: FileItemDB[] = filesData?.map((f: any) => ({ ...f, item_type: 'file' as const })) || [];

      const fileUploaderIds = fetchedFiles.map((file: FileItemDB) => file.uploader_id).filter((id: string | null): id is string => id !== null);
      const folderOwnerIds = fetchedFolders.map((folder: Folder) => folder.owner_id).filter((id: string | null): id is string => id !== null);
      const allUserIdsToFetch = [...new Set([...fileUploaderIds, ...folderOwnerIds])];

      let profilesMap = new Map<string, { full_name: string | null }>();
      if (allUserIdsToFetch.length > 0) {
        const { data: profilesData, error: profilesError } = await supabase
          .from('profiles').select('id, full_name').in('id', allUserIdsToFetch);
        if (profilesError) console.error('Erro ao buscar perfis:', profilesError);
        else if (profilesData) profilesData.forEach(p => profilesMap.set(p.id, { full_name: p.full_name }));
      }

      const items: (Folder | FileItemDB)[] = [...fetchedFolders, ...fetchedFiles].sort((a, b) => {
        if (a.item_type === 'folder' && b.item_type === 'file') return -1;
        if (a.item_type === 'file' && b.item_type === 'folder') return 1;
        const nameA = a.item_type === 'folder' ? a.name : a.file_name;
        const nameB = b.item_type === 'folder' ? b.name : b.file_name;
        return nameA.localeCompare(nameB);
      });

      fileList.innerHTML = '';
      if (items.length === 0) { fileList.innerHTML = currentFolderId ? '<p>Esta pasta está vazia.</p>' : '<p>Nenhum item na raiz.</p>'; }

      const currentLoggedInUserId = session!.user.id;

      items.forEach(item => {
        const itemDiv = document.createElement('div');
        itemDiv.className = 'file-item';

        const itemName = item.item_type === 'folder' ? item.name : item.file_name;
        const iconHtml = getIconForItem(item);

        if (item.item_type === 'folder') {
          itemDiv.classList.add('folder-item');
          itemDiv.dataset.folderId = String(item.id);
          itemDiv.dataset.folderName = item.name;
          itemDiv.dataset.ownerId = item.owner_id; // <-- Adicionado aqui

          itemDiv.innerHTML = `
            <div class="item-icon">${iconHtml}</div>
            <div class="file-info">
              <span class="folder-name-display item-name" title="${itemName}">${itemName}</span>
              <form class="rename-form" style="display:none;">
                <input type="text" value="${itemName}" maxlength="60" required />
                <button type="submit" title="Salvar">✔️</button>
                <button type="button" class="cancel-rename-button" title="Cancelar">✖️</button>
              </form>
            </div>
            <div class="file-actions"></div>
          `;
        } else {
          itemDiv.dataset.uploaderId = item.uploader_id; // <-- Adicionado aqui
          itemDiv.dataset.storagePath = item.storage_path;

          itemDiv.innerHTML = `
            <div class="item-icon">${iconHtml}</div>
            <span class="item-name" title="${itemName}">${itemName}</span>
            <div class="file-actions"></div>
          `;
        }

        const actionsDiv = itemDiv.querySelector('.file-actions')!;

        if (item.item_type === 'file') {
          const { data: publicUrlData } = supabase.storage.from('files').getPublicUrl(item.storage_path);
          const downloadLink = document.createElement('a');
          downloadLink.href = publicUrlData.publicUrl;
          downloadLink.className = 'download-button';
          downloadLink.title = 'Baixar';
          downloadLink.target = '_blank';
          downloadLink.download = item.file_name;
          downloadLink.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>`;
          actionsDiv.appendChild(downloadLink);
        }

        const isOwner = currentLoggedInUserId === (item.item_type === 'folder' ? item.owner_id : item.uploader_id);

        if (isOwner) {
          if (item.item_type === 'folder') {
            const renameBtn = document.createElement('button');
            renameBtn.className = 'rename-folder-button';
            renameBtn.title = 'Renomear';
            renameBtn.dataset.folderId = String(item.id);
            renameBtn.dataset.currentName = item.name;
            renameBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="75" height="75" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" style="display:inline-block;vertical-align:middle;"><path stroke-linecap="round" stroke-linejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125"></path></svg>`;
            renameBtn.style.borderRadius = '4px';
            renameBtn.style.padding = '8px 18px';
            renameBtn.style.background = '#22c55e';
            renameBtn.style.color = '#fff';
            renameBtn.style.border = 'none';
            renameBtn.style.marginLeft = '8px';
            renameBtn.style.display = 'inline-flex';
            renameBtn.style.alignItems = 'center';
            renameBtn.style.gap = '6px';
            renameBtn.style.transition = 'background 0.2s';
            renameBtn.style.boxShadow = 'none';
            renameBtn.style.height = '11vw';
            renameBtn.style.minWidth = '21vw';
            renameBtn.onmouseover = () => { renameBtn.style.background = '#16a34a'; };
            renameBtn.onmouseout = () => { renameBtn.style.background = '#22c55e'; };
            const svg = renameBtn.querySelector('svg');
            if (svg) {
              svg.setAttribute('width', '50');
              svg.setAttribute('height', '50');
              svg.style.display = 'inline-block';
              svg.style.verticalAlign = 'middle';
            }
            actionsDiv.appendChild(renameBtn);
          }

          const deleteBtn = document.createElement('button');
          deleteBtn.className = 'delete-button';
          deleteBtn.title = 'Deletar';
          if (item.item_type === 'folder') {
            deleteBtn.dataset.folderId = String(item.id);
          } else {
            deleteBtn.dataset.fileId = String(item.id);
            deleteBtn.dataset.storagePath = item.storage_path;
          }
          // Aumenta o tamanho do ícone SVG para 28x28
          deleteBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" style="display:inline-block;vertical-align:middle;"><path stroke-linecap="round" stroke-linejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.134-2.09-2.134H8.09a2.09 2.09 0 00-2.09 2.134v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>`;
          actionsDiv.appendChild(deleteBtn);
        }

        // Torna o botão de deletar retangular
        const deleteBtnEl = actionsDiv.querySelector('.delete-button') as HTMLButtonElement | null;
        if (deleteBtnEl) {
          deleteBtnEl.style.borderRadius = '4px';
          deleteBtnEl.style.padding = '4px 10px';
          deleteBtnEl.style.background = '#ef4444';
          deleteBtnEl.style.color = '#fff';
          deleteBtnEl.style.border = 'none';
          deleteBtnEl.style.marginLeft = '6px';
          deleteBtnEl.style.display = 'inline-flex';
          deleteBtnEl.style.alignItems = 'center';
          deleteBtnEl.style.gap = '4px';
          deleteBtnEl.style.transition = 'background 0.2s';
          deleteBtnEl.onmouseover = () => { deleteBtnEl.style.background = '#dc2626'; };
          deleteBtnEl.onmouseout = () => { deleteBtnEl.style.background = '#ef4444'; };
          // Ajusta o tamanho do SVG do botão de deletar
          const svg = deleteBtnEl.querySelector('svg');
          if (svg) {
            svg.setAttribute('width', '28');
            svg.setAttribute('height', '28');
            svg.style.display = 'inline-block';
            svg.style.verticalAlign = 'middle';
          }
        }

        fileList.appendChild(itemDiv);
      });

    } catch (error: any) {
      console.error("Erro geral ao exibir itens:", error);
      if (fileList) fileList.innerHTML = '<p id="file-list-error">Erro ao carregar, verifique sua internet.</p>';
    } finally { hideLoading(); }
  }

  async function handleUpload(event: Event) {
    event.preventDefault();
    const file = fileInput!.files?.[0];
    if (!file || !session) {
      showAppMessage('Por favor, selecione um arquivo.', 'error');
      return;
    }
    showLoading("Enviando, aguarde...");

    const sanitizedOriginalName = sanitizeFileName(file.name);
    const storageFolderPrefix = currentFolderId ? `${session.user.id}/${currentFolderId}` : `${session.user.id}/root`;
    const storagePath = `${storageFolderPrefix}/${Date.now()}_${sanitizedOriginalName}`;

    try {
      const { error: uploadError } = await supabase.storage.from('files').upload(storagePath, file);
      if (uploadError) throw uploadError;

      const { error: insertError } = await supabase.from('files').insert({
        file_name: file.name,
        file_type: file.type,
        storage_path: storagePath,
        uploader_id: session.user.id,
        folder_id: currentFolderId
      });
      if (insertError) throw insertError;

      showAppMessage('Arquivo enviado!', 'success');
      uploadForm!.reset();
      resetFileInputLabel();
      displayItemsInCurrentFolder(currentFolderId);
    } catch (e: any) {
      console.error('Upload falhou:', e);
      showAppMessage(`Falha no upload: ${e.message}`, 'error');
    } finally {
      hideLoading();
    }
  }

  async function handleAttemptDeleteFolder(folderId: string) {
    if (!session?.user) return;
    const currentUserId = session.user.id;
    showLoading("Verificando conteúdo da pasta...");
    let nonOwnedFilesExist = false;
    let containsSubfoldersOrFiles = false;
    try {
      const { data: filesInFolder, error: filesError } = await supabase
        .from('files').select('uploader_id').eq('folder_id', folderId);
      if (filesError) throw filesError;
      if (filesInFolder && filesInFolder.length > 0) {
        containsSubfoldersOrFiles = true;
        if (filesInFolder.some(file => file.uploader_id !== currentUserId)) {
          nonOwnedFilesExist = true;
        }
      }
      const { count: subfolderCount, error: subfoldersError } = await supabase
        .from('folders').select('*', { count: 'exact', head: true }).eq('parent_folder_id', folderId);
      if (subfoldersError) throw subfoldersError;
      if (subfolderCount && subfolderCount > 0) {
        containsSubfoldersOrFiles = true;
      }
    } catch (error: any) {
      hideLoading();
      showAppMessage(`Erro ao verificar conteúdo da pasta: ${error.message}`, 'error');
      return;
    } finally {
      if (loadingOverlayText && loadingOverlayText.textContent === "Verificando conteúdo da pasta...") {
        hideLoading();
      }
    }
    let confirmMessage = `Deletar esta pasta${containsSubfoldersOrFiles ? ' e TODO o seu conteúdo' : ''}? Esta ação não pode ser desfeita.`;
    if (nonOwnedFilesExist) {
      confirmMessage = `Esta pasta contém arquivos que não foram criados por você. Ao deletar, seus arquivos e todas as subpastas serão removidos, e os arquivos de outros usuários serão movidos para a "Central de Arquivos" (raiz). Deseja continuar?`;
    }
    const confirmed = await showCustomConfirm(confirmMessage);
    if (!confirmed) return;
    showLoading("Deletando pasta e conteúdo...");
    const result = await deleteFolderAndContents(folderId);
    hideLoading();
    if (result.success) {
      showAppMessage('Pasta processada com sucesso!', 'success');
      if (currentFolderId === folderId) {
        displayItemsInCurrentFolder(null);
      } else {
        displayItemsInCurrentFolder(currentFolderId);
      }
    } else {
      showAppMessage(`Falha ao deletar pasta: ${result.error || 'Erro desconhecido'}`, 'error');
    }
  }

  async function handleAttemptRenameFolder(folderId: string, newName: string, formElement: HTMLFormElement) {
    showLoading("Renomeando pasta...");
    const result = await renameFolder(folderId, newName);
    hideLoading();
    if (result.success) {
      showAppMessage("Pasta renomeada com sucesso!", "success");
      displayItemsInCurrentFolder(currentFolderId);
    } else {
      showAppMessage(`Erro ao renomear: ${result.error || 'Erro desconhecido'}`, 'error');
      const itemDiv = formElement.closest('.file-item');
      const nameSpan = itemDiv?.querySelector('.folder-name-display') as HTMLElement;
      if (itemDiv && nameSpan) {
        itemDiv.classList.remove('is-renaming');
        formElement.style.display = 'none';
        nameSpan.style.display = 'block';
      }
    }
  }

  // --- EVENT LISTENERS ---
  showSignupViewButton.addEventListener('click', (_event) => {
    if (loginContainer && signupContainer) { loginContainer.style.display = 'none'; signupContainer.style.display = 'block'; }
  });
  showLoginViewButton.addEventListener('click', (_event) => {
    if (loginContainer && signupContainer) { loginContainer.style.display = 'block'; signupContainer.style.display = 'none'; }
  });
  loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const username = (loginForm.elements.namedItem('login-username') as HTMLInputElement).value;
    const password = (loginForm.elements.namedItem('login-password') as HTMLInputElement).value;
    const fakeEmail = `${username.toLowerCase()}@filefacul.local`;
    const { error } = await supabase.auth.signInWithPassword({ email: fakeEmail, password });
    if (error) { showAppMessage('Nome de usuário ou senha inválidos.', 'error'); }
  });
  signupForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const fullName = (signupForm.elements.namedItem('signup-name') as HTMLInputElement).value;
    const username = (signupForm.elements.namedItem('signup-username') as HTMLInputElement).value.toLowerCase();
    const password = (signupForm.elements.namedItem('signup-password') as HTMLInputElement).value;
    if (!fullName || !username || !password) { showAppMessage('Por favor, preencha todos os campos.', 'error'); return; }
    if (password.length < 6) { showAppMessage('A senha deve ter no mínimo 6 caracteres.', 'error'); return; }
    showLoading("Cadastrando usuário...");
    try {
      const { data: existingFullName, error: fullNameCheckError } = await supabase
        .from('profiles').select('full_name').eq('full_name', fullName).single();
      if (fullNameCheckError && fullNameCheckError.code !== 'PGRST116') throw fullNameCheckError;
      if (existingFullName) { showAppMessage('Nome de exibição já usado.', 'error'); hideLoading(); return; }
      const { data: existingUsername, error: usernameCheckError } = await supabase
        .from('profiles').select('username').eq('username', username).single();
      if (usernameCheckError && usernameCheckError.code !== 'PGRST116') throw usernameCheckError;
      if (existingUsername) { showAppMessage('Nome de usuário indisponível.', 'error'); hideLoading(); return; }
      const fakeEmail = `${username}@filefacul.local`;
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: fakeEmail, password: password, options: { data: { full_name: fullName, username: username } }
      });
      if (signUpError) throw signUpError;
      console.log("Usuário cadastrado:", data);
      showAppMessage('Cadastro realizado!', 'success');
      if (loginContainer && signupContainer) { loginContainer.style.display = 'block'; signupContainer.style.display = 'none'; }
    } catch (e: any) {
      console.error("Erro no cadastro:", e);
      if (e.message.includes("User already registered") || e.message.includes("profiles_username_key")) {
        showAppMessage('Nome de usuário indisponível.', 'error');
      } else if (e.message.includes("profiles_full_name_unique")) {
        showAppMessage('Nome de exibição já usado.', 'error');
      } else { showAppMessage(`Erro no cadastro: ${e.message}`, 'error'); }
    } finally { hideLoading(); }
  });
  logoutButton.addEventListener('click', async (_event) => {
    await supabase.auth.signOut();
    showAppMessage('Você saiu.', 'info');
  });
  uploadForm.addEventListener('submit', handleUpload);

  fileList.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    const itemDiv = (event.target as HTMLElement).closest('.file-item') as HTMLElement | null;
    if (!itemDiv) return;

    // Pegue dados do item
    const isFolder = itemDiv.classList.contains('folder-item');
    const itemId = isFolder ? itemDiv.dataset.folderId : itemDiv.dataset.fileId;
    const itemName = isFolder
      ? itemDiv.querySelector('.folder-name-display')?.textContent ?? undefined
      : itemDiv.querySelector('.item-name')?.textContent ?? undefined;

    // Verifique se o usuário é o autor
    const ownerId = isFolder ? itemDiv.dataset.ownerId : itemDiv.dataset.uploaderId;
    if (ownerId !== session?.user.id) return; // <-- Só mostra para o autor

    showItemActionsModal({
      isFolder,
      itemId,
      itemName,
      itemDiv
    });
  });

  // Defina a função (esqueleto)
  function showItemActionsModal(args: {
    isFolder: boolean,
    itemId: string | undefined,
    itemName: string | undefined,
    itemDiv: HTMLElement
  }) {
    // Seleciona o overlay e os elementos do modal de ações
    const overlay = document.getElementById('item-actions-modal-overlay') as HTMLDivElement;
    const modal = document.getElementById('item-actions-modal') as HTMLDivElement;
    const buttonsDiv = document.getElementById('item-actions-buttons') as HTMLDivElement;
    const title = document.getElementById('item-actions-title') as HTMLHeadingElement;
    const cancelBtn = document.getElementById('item-actions-cancel') as HTMLButtonElement;

    if (!overlay || !modal || !buttonsDiv || !title || !cancelBtn) return;

    // Atualiza o título do modal
    title.textContent = args.itemName ? `Ações para "${args.itemName}"` : 'Ações';

    // Limpa os botões antigos
    buttonsDiv.innerHTML = '';

    // Botão de baixar (apenas para arquivos)
    if (!args.isFolder) {
      const downloadBtn = document.createElement('button');
      downloadBtn.className = 'download-button';
      downloadBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" style="width:24px;height:24px;vertical-align:middle;"><path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg> Baixar`;
      downloadBtn.onclick = () => {
        // Procura o link de download no item e clica
        const downloadLink = args.itemDiv.querySelector('.download-button') as HTMLAnchorElement;
        if (downloadLink) downloadLink.click();
        overlay.classList.remove('visible');
        document.getElementById('app')?.classList.remove('app-blurred');
      };
      buttonsDiv.appendChild(downloadBtn);
    }

    // Botão de renomear (apenas para pastas)
    if (args.isFolder) {
      const renameBtn = document.createElement('button');
      renameBtn.className = 'rename-folder-button';
      renameBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" style="vertical-align:middle;"><path stroke-linecap="round" stroke-linejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125"></path></svg> Renomear`;
      renameBtn.onclick = () => {
        overlay.classList.remove('visible');
        document.getElementById('app')?.classList.remove('app-blurred');
        // Abre o modal de renomear já existente
        const renameOverlay = document.getElementById('rename-folder-modal-overlay')!;
        const input = document.getElementById('rename-folder-input') as HTMLInputElement;
        renameOverlay.classList.add('visible');
        input.value = args.itemName || '';
        input.focus();
        input.setSelectionRange(0, input.value.length);
        renameOverlay.setAttribute('data-folder-id', args.itemId || '');
      };
      buttonsDiv.appendChild(renameBtn);
    }

    // Botão de deletar (apenas para pastas)
    if (args.isFolder) {
      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'delete-button';
      deleteBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" style="vertical-align:middle;"><path stroke-linecap="round" stroke-linejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.134-2.09-2.134H8.09a2.09 2.09 0 00-2.09 2.134v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg> Deletar`;
      deleteBtn.onclick = async () => {
        overlay.classList.remove('visible');
        document.getElementById('app')?.classList.remove('app-blurred');
        if (args.itemId) {
          await handleAttemptDeleteFolder(args.itemId);
        }
      };
      buttonsDiv.appendChild(deleteBtn);
    }

    // Botão de cancelar
    cancelBtn.onclick = () => {
      overlay.classList.remove('visible');
      document.getElementById('app')?.classList.remove('app-blurred');
    };

    // Exibe o modal e aplica o blur no fundo
    overlay.classList.add('visible');
    document.getElementById('app')?.classList.add('app-blurred');
  }

  window.addEventListener('click', (event) => {
    if (!(event.target as HTMLElement).closest('.file-actions')) {
      document.querySelectorAll('.file-actions.visible').forEach(menu => {
        menu.classList.remove('visible');
      });
    }
  });

  fileList.addEventListener('touchstart', (event) => {
    const itemDiv = (event.target as HTMLElement).closest('.file-item');
    if (!itemDiv || itemDiv.classList.contains('is-renaming')) return;

    pressTimer = window.setTimeout(() => {
      pressTimer = null;
      // A lógica principal do long press é mostrar o menu
      document.querySelectorAll('.file-actions.visible').forEach(menu => menu.classList.remove('visible'));
      const actionsDiv = itemDiv.querySelector('.file-actions');
      if (actionsDiv && actionsDiv.innerHTML.trim() !== '') {
        actionsDiv.classList.add('visible');
        if (window.navigator.vibrate) {
          window.navigator.vibrate(50);
        }
      }
    }, 1000);
  }, { passive: true });

  fileList.addEventListener('touchend', () => {
    clearTimeout(pressTimer!);
  });

  fileList.addEventListener('touchmove', () => {
    clearTimeout(pressTimer!);
  });

  fileList.addEventListener('click', async (event) => {
    let target = event.target as HTMLElement;
    const clickableItem = target.closest('.file-item');
    if (!clickableItem) return;

    const renameBtn = target.closest('.rename-folder-button');
    if (renameBtn) {
      // Pegue o nome atual e id da pasta
      const folderId = renameBtn.getAttribute('data-folder-id');
      const currentName = renameBtn.getAttribute('data-current-name');
      const overlay = document.getElementById('rename-folder-modal-overlay')!;
      const input = document.getElementById('rename-folder-input') as HTMLInputElement;
      overlay.classList.add('visible');
      input.value = currentName || '';
      input.focus();
      input.setSelectionRange(0, input.value.length);
      // Salve o id da pasta no overlay para uso posterior
      overlay.setAttribute('data-folder-id', folderId || '');
      return;
    }

    if (target.classList.contains('cancel-rename-button')) {
      const folderInfoDiv = clickableItem.querySelector('.file-info');
      const nameSpan = folderInfoDiv?.querySelector('.folder-name-display') as HTMLElement;
      const renameForm = folderInfoDiv?.querySelector('.rename-form') as HTMLFormElement;
      if (nameSpan && renameForm) {
        clickableItem.classList.remove('is-renaming');
        nameSpan.style.display = 'block';
        renameForm.style.display = 'none';
      }
      return;
    }

    const deleteBtn = target.closest('.delete-button');
    if (deleteBtn && deleteBtn.tagName === 'BUTTON') {
      const folderId = (deleteBtn as HTMLElement).dataset.folderId;
      if (folderId) {
        await handleAttemptDeleteFolder(folderId);
      }
      return;
    }

    if (clickableItem.classList.contains('folder-item') && !clickableItem.classList.contains('is-renaming')) {
      const folderId = (clickableItem as HTMLElement).dataset.folderId;
      if (folderId) {
        if (!target.closest('button')) {
          displayItemsInCurrentFolder(folderId);
        }
      }
    }
  });

  fileList.addEventListener('submit', (event) => {
    const form = event.target as HTMLElement;
    if (form.classList.contains('rename-form')) {
      event.preventDefault();
      const input = form.querySelector('input') as HTMLInputElement;
      const newName = input.value;
      const itemDiv = form.closest('.file-item') as HTMLElement | null;
      const folderId = itemDiv?.dataset.folderId;

      if (folderId && newName) {
        handleAttemptRenameFolder(folderId, newName, form as HTMLFormElement);
      }
    }
  });

  createFolderForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const folderName = folderNameInput.value;
    showLoading("Criando pasta...");
    const result = await handleCreateFolder(folderName, session, currentFolderId);
    hideLoading();
    if (result.success) {
      showAppMessage('Pasta criada!', 'success');
      folderNameInput.value = '';
      displayItemsInCurrentFolder(currentFolderId);
    } else {
      showAppMessage(`Erro: ${result.error || 'Desconhecido'}`, 'error');
    }
  });

  fileInput.addEventListener('change', () => {
    if (fileInput?.files && fileInput.files.length > 0) {
      const fileName = fileInput.files[0].name;
      fileInputText.textContent = fileName;
      fileInputLabel.classList.add('file-selected');
      iconAddFile.style.display = 'none';
      iconFileSelected.style.display = 'block';
    } else {
      resetFileInputLabel();
    }
  });

  supabase.auth.onAuthStateChange((_event, newSession) => {
    session = newSession;
    if (!newSession) { currentFolderId = null; }
    updateView();
  });

  const renameFolderModalOverlay = document.getElementById('rename-folder-modal-overlay')!;
  const renameFolderForm = document.getElementById('rename-folder-form') as HTMLFormElement;
  const renameFolderInput = document.getElementById('rename-folder-input') as HTMLInputElement;
  const renameFolderCancel = document.getElementById('rename-folder-cancel') as HTMLButtonElement;

  renameFolderForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const folderId = renameFolderModalOverlay.getAttribute('data-folder-id');
    const newName = renameFolderInput.value.trim();
    if (folderId && newName) {
      handleAttemptRenameFolder(folderId, newName, renameFolderForm);
      renameFolderModalOverlay.classList.remove('visible');
    }
  });

  renameFolderCancel.addEventListener('click', () => {
    renameFolderModalOverlay.classList.remove('visible');
  });
});