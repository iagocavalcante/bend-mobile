#include "vulkan.h"
#include <vulkan/vulkan.h>
#include <cstring>
#include <stdexcept>
#include <string>
#ifdef __ANDROID__
#include <android/log.h>
#endif

static void check(VkResult result, const char* operation) {
    if (result != VK_SUCCESS) throw std::runtime_error(std::string(operation) + ": VkResult " + std::to_string(result));
}

// ponytail: pipeline/resources are per dispatch; cache per device when startup cost matters.
struct Run {
    VkInstance instance{};
    VkDevice device{};
    VkBuffer buffers[2]{};
    VkDeviceMemory memory[2]{};
    VkDescriptorSetLayout descriptorLayout{};
    VkPipelineLayout pipelineLayout{};
    VkShaderModule shader{};
    VkPipeline pipeline{};
    VkDescriptorPool descriptors{};
    VkCommandPool commands{};
    ~Run() {
        if (device) {
            vkDeviceWaitIdle(device);
            if (commands) vkDestroyCommandPool(device, commands, nullptr);
            if (descriptors) vkDestroyDescriptorPool(device, descriptors, nullptr);
            if (pipeline) vkDestroyPipeline(device, pipeline, nullptr);
            if (shader) vkDestroyShaderModule(device, shader, nullptr);
            if (pipelineLayout) vkDestroyPipelineLayout(device, pipelineLayout, nullptr);
            if (descriptorLayout) vkDestroyDescriptorSetLayout(device, descriptorLayout, nullptr);
            for (int i = 0; i < 2; ++i) {
                if (buffers[i]) vkDestroyBuffer(device, buffers[i], nullptr);
                if (memory[i]) vkFreeMemory(device, memory[i], nullptr);
            }
            vkDestroyDevice(device, nullptr);
        }
        if (instance) vkDestroyInstance(instance, nullptr);
    }
};

std::vector<uint32_t> bend_vulkan(const std::vector<uint32_t>& input, const std::vector<uint32_t>& code) {
    if (input.size() > 65536 || code.empty()) throw std::runtime_error("Invalid native input or missing SPIR-V shader");
    if (input.empty()) return {};
    Run r;
    VkApplicationInfo app{VK_STRUCTURE_TYPE_APPLICATION_INFO};
    app.pApplicationName = "Bend Mobile";
    app.apiVersion = VK_API_VERSION_1_0;
    VkInstanceCreateInfo create{VK_STRUCTURE_TYPE_INSTANCE_CREATE_INFO};
    create.pApplicationInfo = &app;
    check(vkCreateInstance(&create, nullptr, &r.instance), "vkCreateInstance");
    uint32_t count = 0;
    check(vkEnumeratePhysicalDevices(r.instance, &count, nullptr), "vkEnumeratePhysicalDevices");
    std::vector<VkPhysicalDevice> devices(count);
    check(vkEnumeratePhysicalDevices(r.instance, &count, devices.data()), "vkEnumeratePhysicalDevices");
    VkPhysicalDevice physical{};
    uint32_t family = 0;
    for (auto candidate : devices) {
        uint32_t n = 0;
        vkGetPhysicalDeviceQueueFamilyProperties(candidate, &n, nullptr);
        std::vector<VkQueueFamilyProperties> queues(n);
        vkGetPhysicalDeviceQueueFamilyProperties(candidate, &n, queues.data());
        for (uint32_t i = 0; i < n; ++i) if (queues[i].queueCount && (queues[i].queueFlags & VK_QUEUE_COMPUTE_BIT)) {
            physical = candidate; family = i; break;
        }
        if (physical) break;
    }
    if (!physical) throw std::runtime_error("No Vulkan compute device is available");
#ifdef __ANDROID__
    VkPhysicalDeviceProperties deviceProperties;
    vkGetPhysicalDeviceProperties(physical, &deviceProperties);
    __android_log_print(ANDROID_LOG_INFO, "BendCompute", "Vulkan device: %s", deviceProperties.deviceName);
#endif
    float priority = 1;
    VkDeviceQueueCreateInfo queueInfo{VK_STRUCTURE_TYPE_DEVICE_QUEUE_CREATE_INFO};
    queueInfo.queueFamilyIndex = family; queueInfo.queueCount = 1; queueInfo.pQueuePriorities = &priority;
    VkDeviceCreateInfo deviceInfo{VK_STRUCTURE_TYPE_DEVICE_CREATE_INFO};
    deviceInfo.queueCreateInfoCount = 1; deviceInfo.pQueueCreateInfos = &queueInfo;
    check(vkCreateDevice(physical, &deviceInfo, nullptr, &r.device), "vkCreateDevice");
    VkQueue queue;
    vkGetDeviceQueue(r.device, family, 0, &queue);
    VkPhysicalDeviceMemoryProperties properties;
    vkGetPhysicalDeviceMemoryProperties(physical, &properties);
    VkDeviceSize bytes = input.size() * sizeof(uint32_t);
    for (int i = 0; i < 2; ++i) {
        VkBufferCreateInfo buffer{VK_STRUCTURE_TYPE_BUFFER_CREATE_INFO};
        buffer.size = bytes; buffer.usage = VK_BUFFER_USAGE_STORAGE_BUFFER_BIT;
        check(vkCreateBuffer(r.device, &buffer, nullptr, &r.buffers[i]), "vkCreateBuffer");
        VkMemoryRequirements requirements;
        vkGetBufferMemoryRequirements(r.device, r.buffers[i], &requirements);
        uint32_t type = UINT32_MAX;
        for (uint32_t j = 0; j < properties.memoryTypeCount; ++j) {
            auto wanted = VK_MEMORY_PROPERTY_HOST_VISIBLE_BIT | VK_MEMORY_PROPERTY_HOST_COHERENT_BIT;
            if ((requirements.memoryTypeBits & (1u << j)) && (properties.memoryTypes[j].propertyFlags & wanted) == wanted) { type = j; break; }
        }
        if (type == UINT32_MAX) throw std::runtime_error("Vulkan backend requires host-visible coherent storage memory");
        VkMemoryAllocateInfo allocation{VK_STRUCTURE_TYPE_MEMORY_ALLOCATE_INFO};
        allocation.allocationSize = requirements.size; allocation.memoryTypeIndex = type;
        check(vkAllocateMemory(r.device, &allocation, nullptr, &r.memory[i]), "vkAllocateMemory");
        check(vkBindBufferMemory(r.device, r.buffers[i], r.memory[i], 0), "vkBindBufferMemory");
    }
    void* mapped;
    check(vkMapMemory(r.device, r.memory[0], 0, bytes, 0, &mapped), "vkMapMemory(input)");
    std::memcpy(mapped, input.data(), bytes);
    vkUnmapMemory(r.device, r.memory[0]);
    VkDescriptorSetLayoutBinding bindings[2]{};
    for (uint32_t i = 0; i < 2; ++i) bindings[i] = {i, VK_DESCRIPTOR_TYPE_STORAGE_BUFFER, 1, VK_SHADER_STAGE_COMPUTE_BIT, nullptr};
    VkDescriptorSetLayoutCreateInfo layout{VK_STRUCTURE_TYPE_DESCRIPTOR_SET_LAYOUT_CREATE_INFO};
    layout.bindingCount = 2; layout.pBindings = bindings;
    check(vkCreateDescriptorSetLayout(r.device, &layout, nullptr, &r.descriptorLayout), "vkCreateDescriptorSetLayout");
    VkPushConstantRange push{VK_SHADER_STAGE_COMPUTE_BIT, 0, sizeof(uint32_t)};
    VkPipelineLayoutCreateInfo pipelineLayout{VK_STRUCTURE_TYPE_PIPELINE_LAYOUT_CREATE_INFO};
    pipelineLayout.setLayoutCount = 1; pipelineLayout.pSetLayouts = &r.descriptorLayout;
    pipelineLayout.pushConstantRangeCount = 1; pipelineLayout.pPushConstantRanges = &push;
    check(vkCreatePipelineLayout(r.device, &pipelineLayout, nullptr, &r.pipelineLayout), "vkCreatePipelineLayout");
    VkShaderModuleCreateInfo shader{VK_STRUCTURE_TYPE_SHADER_MODULE_CREATE_INFO};
    shader.codeSize = code.size() * 4; shader.pCode = code.data();
    check(vkCreateShaderModule(r.device, &shader, nullptr, &r.shader), "vkCreateShaderModule");
    VkComputePipelineCreateInfo pipeline{VK_STRUCTURE_TYPE_COMPUTE_PIPELINE_CREATE_INFO};
    pipeline.layout = r.pipelineLayout;
    pipeline.stage = {VK_STRUCTURE_TYPE_PIPELINE_SHADER_STAGE_CREATE_INFO};
    pipeline.stage.stage = VK_SHADER_STAGE_COMPUTE_BIT; pipeline.stage.module = r.shader; pipeline.stage.pName = "main";
    check(vkCreateComputePipelines(r.device, VK_NULL_HANDLE, 1, &pipeline, nullptr, &r.pipeline), "vkCreateComputePipelines");
    VkDescriptorPoolSize poolSize{VK_DESCRIPTOR_TYPE_STORAGE_BUFFER, 2};
    VkDescriptorPoolCreateInfo pool{VK_STRUCTURE_TYPE_DESCRIPTOR_POOL_CREATE_INFO};
    pool.maxSets = 1; pool.poolSizeCount = 1; pool.pPoolSizes = &poolSize;
    check(vkCreateDescriptorPool(r.device, &pool, nullptr, &r.descriptors), "vkCreateDescriptorPool");
    VkDescriptorSetAllocateInfo allocate{VK_STRUCTURE_TYPE_DESCRIPTOR_SET_ALLOCATE_INFO};
    allocate.descriptorPool = r.descriptors; allocate.descriptorSetCount = 1; allocate.pSetLayouts = &r.descriptorLayout;
    VkDescriptorSet set;
    check(vkAllocateDescriptorSets(r.device, &allocate, &set), "vkAllocateDescriptorSets");
    VkDescriptorBufferInfo buffers[2]{{r.buffers[0], 0, bytes}, {r.buffers[1], 0, bytes}};
    VkWriteDescriptorSet writes[2]{};
    for (uint32_t i = 0; i < 2; ++i) {
        writes[i] = {VK_STRUCTURE_TYPE_WRITE_DESCRIPTOR_SET};
        writes[i].dstSet = set; writes[i].dstBinding = i; writes[i].descriptorCount = 1;
        writes[i].descriptorType = VK_DESCRIPTOR_TYPE_STORAGE_BUFFER; writes[i].pBufferInfo = &buffers[i];
    }
    vkUpdateDescriptorSets(r.device, 2, writes, 0, nullptr);
    VkCommandPoolCreateInfo commandPool{VK_STRUCTURE_TYPE_COMMAND_POOL_CREATE_INFO};
    commandPool.queueFamilyIndex = family;
    check(vkCreateCommandPool(r.device, &commandPool, nullptr, &r.commands), "vkCreateCommandPool");
    VkCommandBufferAllocateInfo commandInfo{VK_STRUCTURE_TYPE_COMMAND_BUFFER_ALLOCATE_INFO};
    commandInfo.commandPool = r.commands; commandInfo.level = VK_COMMAND_BUFFER_LEVEL_PRIMARY; commandInfo.commandBufferCount = 1;
    VkCommandBuffer command;
    check(vkAllocateCommandBuffers(r.device, &commandInfo, &command), "vkAllocateCommandBuffers");
    VkCommandBufferBeginInfo begin{VK_STRUCTURE_TYPE_COMMAND_BUFFER_BEGIN_INFO};
    check(vkBeginCommandBuffer(command, &begin), "vkBeginCommandBuffer");
    vkCmdBindPipeline(command, VK_PIPELINE_BIND_POINT_COMPUTE, r.pipeline);
    vkCmdBindDescriptorSets(command, VK_PIPELINE_BIND_POINT_COMPUTE, r.pipelineLayout, 0, 1, &set, 0, nullptr);
    uint32_t length = input.size();
    vkCmdPushConstants(command, r.pipelineLayout, VK_SHADER_STAGE_COMPUTE_BIT, 0, sizeof(length), &length);
    vkCmdDispatch(command, (length + 63) / 64, 1, 1);
    VkMemoryBarrier barrier{VK_STRUCTURE_TYPE_MEMORY_BARRIER};
    barrier.srcAccessMask = VK_ACCESS_SHADER_WRITE_BIT; barrier.dstAccessMask = VK_ACCESS_HOST_READ_BIT;
    vkCmdPipelineBarrier(command, VK_PIPELINE_STAGE_COMPUTE_SHADER_BIT, VK_PIPELINE_STAGE_HOST_BIT, 0, 1, &barrier, 0, nullptr, 0, nullptr);
    check(vkEndCommandBuffer(command), "vkEndCommandBuffer");
    VkSubmitInfo submit{VK_STRUCTURE_TYPE_SUBMIT_INFO};
    submit.commandBufferCount = 1; submit.pCommandBuffers = &command;
    check(vkQueueSubmit(queue, 1, &submit, VK_NULL_HANDLE), "vkQueueSubmit");
    check(vkQueueWaitIdle(queue), "vkQueueWaitIdle");
    std::vector<uint32_t> output(input.size());
    check(vkMapMemory(r.device, r.memory[1], 0, bytes, 0, &mapped), "vkMapMemory(output)");
    std::memcpy(output.data(), mapped, bytes);
    vkUnmapMemory(r.device, r.memory[1]);
    return output;
}
