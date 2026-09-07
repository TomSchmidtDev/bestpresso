import { useEffect, useState } from 'react'
import { getDecaidSettingsUrl } from './api/decaid/config'
import { AppShell } from './app/AppShell'
import { FullscreenPrompt } from './components/FullscreenPrompt/FullscreenPrompt'
import { InteractionSound } from './components/InteractionSound/InteractionSound'
import { ValueAdjustmentProvider } from './components/ValueAdjustment/ValueAdjustmentProvider'
import { useBrewingData } from './features/brew/useBrewingData'
import { ProfilesPanel } from './features/profiles/ProfilesPanel'
import { PreviousShotScreen } from './features/history/PreviousShotScreen'
import { BeanManager } from './features/bag/BeanManager'
import { useBagData } from './features/bag/useBagData'
import type { Bean, BeanBatch } from './domain/bag'
import './styles/index.css'

type AppPage = 'home' | 'profiles' | 'previous-pull' | 'beans'

const currentPage = (): AppPage => {
  const page = new URLSearchParams(window.location.search).get('page')
  return page === 'profiles' || page === 'previous-pull' || page === 'beans' ? page : 'home'
}

export default function App() {
  const data = useBrewingData()
  const bagData = useBagData(data.connection)
  const [bagEditTarget, setBagEditTarget] = useState<{ bean: Bean; batch: BeanBatch } | 'new' | null>(null)
  const bags = bagData.beans.flatMap((bean) => bagData.batches.filter((batch) => batch.beanId === bean.id).map((batch) => ({ bean, batch })))
  const existingRoasters = [...new Set(bagData.beans.map((bean) => bean.roaster))]
  const existingBeanNamesForRoaster = (roaster: string) => bagData.beans.filter((bean) => bean.roaster === roaster).map((bean) => bean.name)
  const createBagAndSelect = async (beanInput: Parameters<typeof bagData.createBeanAndBatch>[0], batchInput: Parameters<typeof bagData.createBeanAndBatch>[1]) => {
    const { bean, batch } = await bagData.createBeanAndBatch(beanInput, batchInput)
    await data.selectBag(bean, batch)
  }
  const updateBagAndSelect = async (beanId: string, beanPatch: Parameters<typeof bagData.updateBeanFields>[1], batchId: string, batchPatch: Parameters<typeof bagData.updateBatchFields>[1]) => {
    const bean = await bagData.updateBeanFields(beanId, beanPatch)
    const batch = await bagData.updateBatchFields(batchId, batchPatch)
    await data.selectBag(bean, batch)
  }
  const [, setPage] = useState(currentPage)
  const page = data.utilityOperation ? 'home' : currentPage()
  const utilityOperationKind = data.utilityOperation?.kind

  useEffect(() => {
    const handlePopState = () => setPage(currentPage())
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  useEffect(() => {
    if (!utilityOperationKind || currentPage() === 'home') return
    const url = new URL(window.location.href)
    url.searchParams.delete('page')
    window.history.replaceState({ page: 'home' }, '', url)
  }, [utilityOperationKind])

  const navigate = (nextPage: AppPage) => {
    const url = new URL(window.location.href)
    if (nextPage === 'home') url.searchParams.delete('page')
    else url.searchParams.set('page', nextPage)
    url.searchParams.delete('profileId')
    window.history.pushState({ page: nextPage }, '', url)
    setPage(nextPage)
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' })
  }

  let screen
  if (page === 'profiles' && !data.liveBrew.visible) screen = <ProfilesPanel profiles={data.allProfiles} favoriteProfileSlots={data.favoriteProfileSlots} activeProfileId={data.model.activeProfileId} feedback={data.settingFeedback} onSelectProfile={async (profileId) => { const selected = await data.selectProfile(profileId); if (selected) navigate('home'); return selected }} onSetFavoriteSlot={data.setFavoriteProfileSlot} onRemoveFavorite={data.removeFavoriteProfile} onClose={() => navigate('home')} />
  else if (page === 'previous-pull' && !data.liveBrew.visible) screen = <PreviousShotScreen shots={data.shotHistory} initialShot={data.model.previousShot} status={data.previousShotStatus} onSelectShot={data.loadHistoryShot} onDismiss={() => navigate('home')} />
  else if (page === 'beans') screen = <BeanManager beans={bagData.beans} batches={bagData.batches} onEditBag={(bean, batch) => { setBagEditTarget({ bean, batch }); navigate('home') }} onDeleteBean={(bean) => { if (window.confirm(`Delete "${bean.name}" and all its bags? This can't be undone.`)) void bagData.deleteBeanAndBatches(bean.id) }} onRenameRoaster={(oldRoaster, newRoaster) => void bagData.renameRoaster(oldRoaster, newRoaster)} onAddBag={() => { setBagEditTarget('new'); navigate('home') }} onClose={() => navigate('home')} />
  else screen = <AppShell {...data} onSleep={data.toggleSleep} onWake={data.wakeMachine} onStopEspresso={data.stopEspresso} onSkipBrewStage={data.skipBrewStage} onStartDemoBrew={data.startDemoBrew} onPrepareCleaning={data.prepareCleaningSequence} onCancelCleaning={data.cancelCleaningSequence} onDismissLiveBrew={data.dismissLiveBrew} onSearchScale={data.searchForScale} onConnectScale={data.connectToScale} onDismissScalePicker={data.dismissScalePicker} onTareScale={data.tareConnectedScale} onUpdateMachineSetting={data.updateMachineSetting} onUpdateProfileSetting={data.updateProfileSetting} onSelectProfile={data.selectProfile} onOpenSettings={() => window.location.assign(getDecaidSettingsUrl())} onManageProfiles={() => navigate('profiles')} onOpenPreviousShot={() => navigate('previous-pull')} bags={bags} bagEditTarget={bagEditTarget} existingRoasters={existingRoasters} existingBeanNamesForRoaster={existingBeanNamesForRoaster} selectBag={data.selectBag} createBagAndSelect={createBagAndSelect} updateBagAndSelect={updateBagAndSelect} onClearBagEditTarget={() => setBagEditTarget(null)} onRequestNewBag={() => setBagEditTarget('new')} onManageBeans={() => navigate('beans')} />

  return <ValueAdjustmentProvider><InteractionSound /><FullscreenPrompt />{screen}</ValueAdjustmentProvider>
}
